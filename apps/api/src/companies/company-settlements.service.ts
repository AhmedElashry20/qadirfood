// تسويات شركات الأسطول — الجانب اللي بيدفع للشركة أجور مناديبها.
//
// النموذج اللي العميل اختاره: المنصة بتدفع للشركة (مجمّع أجور المناديب ناقص
// عمولة المنصة)، والشركة بتوزّع على مناديبها. فأجر المندوب التابع لشركة **ما
// بيدخلش محفظته الشخصية** وقت التسليم — بيتجمّع في تسوية الشركة.
//
// نفس مبادئ تسوية المطعم: كل رقم ليه سطر، كل طلب بيتسوّى مرة واحدة
// (`Order.companySettlementId`)، وقفل استشاري ضد الدورات المتزامنة.

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, DistributionStatus, OrderStatus, Prisma, SettlementStatus, UserRole } from '@prisma/client';
import Decimal from 'decimal.js';

import { AuditService } from '../audit/audit.module';
import type { AuthUser } from '../common';
import { PrismaService } from '../prisma/prisma.service';
import { computeCompanySettlement } from './company-settlement-math';
import type {
  RunCompanySettlementDto,
  SaveCompanyPayoutAccountDto,
  TransferCompanySettlementDto,
} from './companies.dto';

@Injectable()
export class CompanySettlementsService {
  private readonly logger = new Logger(CompanySettlementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** الشركة بتشوف تسوياتها بس؛ الأدمن الكل. بيرمي 403 لو حاولت شركة تانية. */
  private scopeCompanyId(user: AuthUser, requested?: string): string | undefined {
    if (user.role === UserRole.ADMIN) return requested;
    if (user.role === UserRole.COMPANY) {
      if (!user.companyId) throw new ForbiddenException('الجلسة مش مربوطة بشركة');
      if (requested && requested !== user.companyId) throw new ForbiddenException('مش مسموح لك بشركة تانية');
      return user.companyId;
    }
    throw new ForbiddenException('غير مصرح');
  }

  async run(user: AuthUser, dto: RunCompanySettlementDto) {
    if (user.role !== UserRole.ADMIN) throw new ForbiddenException('تشغيل التسويات للأدمن بس');

    const periodEnd = dto.periodEnd ? new Date(dto.periodEnd) : new Date();
    if (Number.isNaN(periodEnd.getTime())) throw new BadRequestException('تاريخ نهاية الفترة غير صحيح');

    const companies = await this.prisma.company.findMany({ select: { id: true } });
    const created: string[] = [];
    for (const company of companies) {
      const id = await this.runForCompany(company.id, periodEnd, user.userId);
      if (id) created.push(id);
    }

    await this.audit.record(
      user,
      AuditAction.SETTLEMENT_RUN,
      'companySettlement',
      periodEnd.toISOString(),
      `دورة تسوية شركات: اتعملت ${created.length} تسوية لحد ${periodEnd.toISOString().slice(0, 10)}`,
      { generated: created.length, settlementIds: created },
    );
    return { generated: created.length, periodEnd: periodEnd.toISOString() };
  }

  private async runForCompany(companyId: string, periodEnd: Date, actorId: string): Promise<string | null> {
    return this.prisma.$transaction(async (tx) => {
      // قفل استشاري لكل شركة — يمنع دورتين متزامنتين ياخدوا نفس الطلبات.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'company-settlement:' + companyId}))`;

      const company = await tx.company.findUnique({ where: { id: companyId }, select: { commissionRate: true } });
      if (!company) return null;

      // طلبات مناديب الشركة المسلّمة غير المسوّاة (لتسوية الشركة).
      const orders = await tx.order.findMany({
        where: {
          status: OrderStatus.DELIVERED,
          companySettlementId: null,
          captainPayout: { gt: 0 },
          captain: { companyId },
          placedAt: { lte: periodEnd },
        },
        select: {
          id: true,
          orderNumber: true,
          captainPayout: true,
          captainId: true,
          captain: { select: { user: { select: { fullName: true } } } },
        },
        orderBy: { placedAt: 'asc' },
      });

      if (!orders.length) return null;

      // الحسبة كلها في دالة نقية مختبَرة (`company-settlement-math.ts`) —
      // الثوابت «gross = مجموع السطور = مجموع التوزيعات» و«net = gross − commission».
      const { grossPayout, commission, netPayout, lines, distributions } = computeCompanySettlement(
        orders.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          captainId: o.captainId!,
          captainName: o.captain?.user.fullName ?? 'مندوب',
          captainPayout: o.captainPayout.toString(),
        })),
        company.commissionRate.toString(),
      );

      const account = await tx.companyPayoutAccount.findUnique({ where: { companyId } });

      const settlement = await tx.companySettlement.create({
        data: {
          companyId,
          // الفترة «لحد periodEnd» — التقسيم بالربط (companySettlementId) مش بالتاريخ.
          periodStart: periodEnd,
          periodEnd,
          grossPayout: grossPayout.toFixed(2),
          commission: commission.toFixed(2),
          netPayout: netPayout.toFixed(2),
          tripCount: orders.length,
          payoutRef: account ? this.maskIban(account.iban) : null,
          createdById: actorId,
          lines: { createMany: { data: lines } },
          // صف توزيع لكل مندوب — الطرف اللي الشركة بتدفعه لمناديبها.
          distributions: { createMany: { data: distributions } },
        },
      });

      await tx.order.updateMany({
        where: { id: { in: orders.map((o) => o.id) } },
        data: { companySettlementId: settlement.id },
      });

      return settlement.id;
    });
  }

  async transfer(user: AuthUser, id: string, dto: TransferCompanySettlementDto) {
    if (user.role !== UserRole.ADMIN) throw new ForbiddenException('التحويل للأدمن بس');

    return this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ id: string; status: SettlementStatus }[]>`
        SELECT id, status FROM company_settlements WHERE id = ${id} FOR UPDATE`;
      if (!row) throw new NotFoundException('التسوية غير موجودة');
      if (row.status === SettlementStatus.TRANSFERRED) throw new ConflictException('التسوية متحوّلة خلاص');

      const updated = await tx.companySettlement.update({
        where: { id },
        data: { status: SettlementStatus.TRANSFERRED, transferRef: dto.transferRef, transferredAt: new Date() },
      });
      await this.audit.record(
        user,
        AuditAction.SETTLEMENT_TRANSFER,
        'companySettlement',
        id,
        `تحويل تسوية شركة ${Number(updated.netPayout).toFixed(2)} ر.س — مرجع ${dto.transferRef}`,
        { netPayout: Number(updated.netPayout), transferRef: dto.transferRef, companyId: updated.companyId },
        tx,
      );
      return this.mapSettlement(updated);
    });
  }

  async list(user: AuthUser, companyId: string | undefined, status: SettlementStatus | undefined, page = 1, pageSize = 20) {
    const scoped = this.scopeCompanyId(user, companyId);
    const where: Prisma.CompanySettlementWhereInput = {
      ...(scoped ? { companyId: scoped } : {}),
      ...(status ? { status } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.companySettlement.findMany({
        where,
        include: { company: { select: { nameAr: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.companySettlement.count({ where }),
    ]);

    return {
      data: rows.map((r) => ({ ...this.mapSettlement(r), companyName: r.company.nameAr })),
      total,
      page,
      pageSize,
    };
  }

  async detail(user: AuthUser, id: string) {
    const settlement = await this.prisma.companySettlement.findUnique({
      where: { id },
      include: { company: { select: { nameAr: true } }, lines: { orderBy: { createdAt: 'asc' } } },
    });
    if (!settlement) throw new NotFoundException('التسوية غير موجودة');
    this.scopeCompanyId(user, settlement.companyId);

    return {
      ...this.mapSettlement(settlement),
      companyName: settlement.company.nameAr,
      lines: settlement.lines.map((l) => ({
        id: l.id,
        orderId: l.orderId,
        captainId: l.captainId,
        amount: Number(l.amount),
        descriptionAr: l.descriptionAr,
      })),
    };
  }

  /**
   * توزيع تسوية على المناديب — كل مندوب وحصته من التسوية دي.
   *
   * ده اللي الشركة محتاجاه عشان توزّع: التسوية بتيجي للشركة مجمّعة، والشركة
   * لازم تعرف تدفع لكل مندوب كام. بنجمّع سطور التسوية حسب المندوب.
   *
   * ملاحظة: الحصص دي **قبل** عمولة المنصة (إجمالي أجور المندوب). لو الشركة
   * بتخصم حصتها من العمولة على المناديب، ده قرار الشركة — إحنا بنعرض الأجر الخام.
   */
  async captainBreakdown(user: AuthUser, id: string) {
    const settlement = await this.prisma.companySettlement.findUnique({
      where: { id },
      select: { companyId: true, grossPayout: true, commission: true, netPayout: true },
    });
    if (!settlement) throw new NotFoundException('التسوية غير موجودة');
    this.scopeCompanyId(user, settlement.companyId);

    // بنقرا من صفوف التوزيع الثابتة — فيها حالة الدفع (مش حساب لحظي).
    const rows = await this.prisma.captainDistribution.findMany({
      where: { companySettlementId: id },
      include: { captain: { select: { user: { select: { fullName: true, phone: true } } } } },
      orderBy: { amount: 'desc' },
    });

    return {
      settlementId: id,
      grossPayout: Number(settlement.grossPayout),
      commission: Number(settlement.commission),
      netPayout: Number(settlement.netPayout),
      captains: rows.map((r) => ({
        distributionId: r.id,
        captainId: r.captainId,
        captainName: r.captain.user.fullName,
        captainPhone: r.captain.user.phone,
        tripCount: r.tripCount,
        grossAmount: Number(r.amount),
        status: r.status,
        reference: r.reference,
        paidAt: r.paidAt?.toISOString() ?? null,
      })),
    };
  }

  /**
   * الشركة بتسجّل إنها دفعت لمندوب حصته. ده الطرف التاني من النموذج:
   * المنصة دفعت للشركة (تحويل التسوية)، والشركة بتدفع لمناديبها وبتسجّل هنا.
   *
   * مقنّن للشركة صاحبة التسوية بس — نفس مبدأ النطاق في كل الموديول.
   */
  async payDistribution(user: AuthUser, distributionId: string, reference?: string) {
    const dist = await this.prisma.captainDistribution.findUnique({
      where: { id: distributionId },
      include: { companySettlement: { select: { companyId: true } }, captain: { select: { user: { select: { fullName: true } } } } },
    });
    if (!dist) throw new NotFoundException('صف التوزيع غير موجود');
    this.scopeCompanyId(user, dist.companySettlement.companyId);
    if (dist.status === DistributionStatus.PAID) throw new ConflictException('اتسجّل مدفوع خلاص');

    const updated = await this.prisma.captainDistribution.update({
      where: { id: distributionId },
      data: {
        status: DistributionStatus.PAID,
        reference: reference ?? null,
        paidAt: new Date(),
        paidById: user.userId,
      },
    });

    return {
      distributionId: updated.id,
      captainId: updated.captainId,
      captainName: dist.captain.user.fullName,
      amount: Number(updated.amount),
      status: updated.status,
      reference: updated.reference,
      paidAt: updated.paidAt?.toISOString() ?? null,
    };
  }

  async getPayoutAccount(user: AuthUser, companyId: string) {
    this.scopeCompanyId(user, companyId);
    const account = await this.prisma.companyPayoutAccount.findUnique({ where: { companyId } });
    return { account: account ? this.mapAccount(account) : null };
  }

  async savePayoutAccount(user: AuthUser, companyId: string, dto: SaveCompanyPayoutAccountDto) {
    if (user.role !== UserRole.ADMIN) throw new ForbiddenException('حساب الاستلام بيتحدّد من الأدمن');
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('الشركة غير موجودة');

    const iban = dto.iban.replace(/\s+/g, '').toUpperCase();
    if (!/^SA\d{22}$/.test(iban)) throw new BadRequestException('الآيبان لازم يكون سعودي صحيح (SA + ٢٢ رقم)');

    const account = await this.prisma.companyPayoutAccount.upsert({
      where: { companyId },
      create: { companyId, bankName: dto.bankName, accountName: dto.accountName, iban },
      update: { bankName: dto.bankName, accountName: dto.accountName, iban },
    });

    await this.audit.record(
      user,
      AuditAction.PAYOUT_ACCOUNT_SAVE,
      'company',
      companyId,
      `تحديث حساب استلام الشركة ${company.nameAr} — ${dto.bankName} ${this.maskIban(iban)}`,
      { companyId, bankName: dto.bankName, ibanMasked: this.maskIban(iban) },
    );
    return this.mapAccount(account);
  }

  private mapSettlement(s: {
    id: string;
    companyId: string;
    periodStart: Date;
    periodEnd: Date;
    grossPayout: Prisma.Decimal;
    commission: Prisma.Decimal;
    netPayout: Prisma.Decimal;
    tripCount: number;
    status: SettlementStatus;
    payoutRef: string | null;
    transferRef: string | null;
    transferredAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: s.id,
      companyId: s.companyId,
      periodStart: s.periodStart.toISOString(),
      periodEnd: s.periodEnd.toISOString(),
      grossPayout: Number(s.grossPayout),
      commission: Number(s.commission),
      netPayout: Number(s.netPayout),
      tripCount: s.tripCount,
      status: s.status,
      payoutRef: s.payoutRef,
      transferRef: s.transferRef,
      transferredAt: s.transferredAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
    };
  }

  private mapAccount(a: { id: string; companyId: string; bankName: string; accountName: string; iban: string; updatedAt: Date }) {
    return {
      id: a.id,
      companyId: a.companyId,
      bankName: a.bankName,
      accountName: a.accountName,
      iban: this.maskIban(a.iban),
      updatedAt: a.updatedAt.toISOString(),
    };
  }

  private maskIban(iban: string): string {
    const clean = iban.replace(/\s+/g, '');
    if (clean.length <= 8) return '••••';
    return `${clean.slice(0, 4)} •••• ${clean.slice(-4)}`;
  }
}
