// التسويات المالية للمطاعم — الجانب اللي بيدفع للمطعم مستحقه.
//
// القاعدة اللي الموديول كله ماشي عليها (نفس دفتر المحفظة والمدفوعات):
// **كل رقم في التسوية ليه سطر**. `Settlement.netPayout` مش رقم مكتوب — هو
// المجموع الجبري لسطور `SettlementLine`، وكل سطر بيشاور على طلب أو استرداد.
//
// ضمان عدم الدفع مرتين: كل طلب بيتربط بتسوية واحدة (`Order.settlementId`)، وكل
// استرداد تحمّله المطعم بيتربط بتسوية واحدة (`Refund.settlementId`). الدورة
// بتلمّ **اللي لسه ماتسوّاش** بس، فاسترداد جه بعد ما الطلب اتسوّى بيتحسب في
// الدورة اللي بعدها كتسوية عكسية — مافيش فلوس بتضيع ولا بتتحسب مرتين.

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  OrderStatus,
  Prisma,
  RefundLiability,
  SettlementStatus,
  UserRole,
} from '@prisma/client';
import Decimal from 'decimal.js';

import type { AuthUser } from '../common';
import { AuditService } from '../audit/audit.module';
import { SETTLED_REFUND_STATUSES } from '../payments/payments.service';
import { computeSettlement } from './settlement-math';
import { PrismaService } from '../prisma/prisma.service';
import type { RunSettlementDto, SavePayoutAccountDto, TransferSettlementDto } from './settlements.dto';

/** الاستردادات اللي بتأثّر على مستحقات المطعم — تحمّل المطعم أو «مافيش». */
const RESTAURANT_BORNE: RefundLiability[] = [RefundLiability.NONE, RefundLiability.RESTAURANT];

@Injectable()
export class SettlementsService {
  private readonly logger = new Logger(SettlementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * بيشغّل دورة تسوية لكل المطاعم لحد `periodEnd` (افتراضياً دلوقتي).
   *
   * لكل مطعم بياخد:
   *   • الطلبات المسلّمة غير المسوّاة (مبيعات + عمولة)
   *   • استرداداته غير المحتسبة (خصم − عمولة رجعت)
   * ويعمل تسوية واحدة بسطورها، ويعلّم الطلبات والاستردادات إنها اتسوّت.
   *
   * المطعم اللي مالوش أي حركة جديدة بيتّخطى — مافيش تسوية فاضية.
   */
  async run(user: AuthUser, dto: RunSettlementDto) {
    this.assertAdmin(user);

    const periodEnd = dto.periodEnd ? new Date(dto.periodEnd) : new Date();
    if (Number.isNaN(periodEnd.getTime())) throw new BadRequestException('تاريخ نهاية الفترة غير صحيح');

    const restaurants = await this.prisma.restaurant.findMany({ select: { id: true, nameAr: true } });
    const created: string[] = [];

    for (const restaurant of restaurants) {
      const settlementId = await this.runForRestaurant(restaurant.id, periodEnd, user.userId);
      if (settlementId) created.push(settlementId);
    }

    this.logger.log(`دورة تسوية: اتعملت ${created.length} تسوية لحد ${periodEnd.toISOString()}`);
    await this.audit.record(
      user,
      AuditAction.SETTLEMENT_RUN,
      'settlement',
      periodEnd.toISOString(),
      `دورة تسوية: اتعملت ${created.length} تسوية لحد ${periodEnd.toISOString().slice(0, 10)}`,
      { generated: created.length, settlementIds: created, periodEnd: periodEnd.toISOString() },
    );
    return { generated: created.length, periodEnd: periodEnd.toISOString() };
  }

  /**
   * تسوية مطعم واحد. بترجّع id التسوية، أو null لو مفيش حاجة تتسوّى.
   *
   * كله جوه معاملة واحدة: لو اتعمل صف تسوية وبعدين فشل ربط الطلبات، الاتنين
   * بيترجعوا — عشان ما يحصلش تسوية بتشاور على طلبات لسه مربوطة بغيرها.
   */
  private async runForRestaurant(restaurantId: string, periodEnd: Date, actorId: string): Promise<string | null> {
    return this.prisma.$transaction(async (tx) => {
      // قفل استشاري على مستوى المطعم داخل المعاملة: دورتين تسوية متزامنتين
      // (أدمنين، أو دبل كليك) كانوا هيقروا نفس الطلبات غير المسوّاة قبل ما أي
      // واحدة تعمل commit، ويعملوا تسويتين لنفس الطلبات ⇒ دفع مرتين. القفل ده
      // بيخلّي التانية تستنى الأولى، وبعدها تلاقي الطلبات اتربطت فترجّع فاضية.
      // executeRaw مش queryRaw: الدالة بترجّع void اللي queryRaw مابيعرفش يفكّه.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'settlement:' + restaurantId}))`;

      const orders = await tx.order.findMany({
        where: {
          branch: { restaurantId },
          status: OrderStatus.DELIVERED,
          settlementId: null,
          placedAt: { lte: periodEnd },
        },
        select: {
          id: true,
          orderNumber: true,
          subtotal: true,
          discount: true,
          commission: true,
          placedAt: true,
        },
        orderBy: { placedAt: 'asc' },
      });

      const refunds = await tx.refund.findMany({
        where: {
          // لازم الطلب يكون **مسلّم**: المطعم بيتسوّى على الطلبات المسلّمة بس،
          // فاسترداد طلب ملغي حركة بين المنصة والعميل — المطعم مالوش دعوة بيها.
          // من غير الشرط ده كان المطعم بيتخصم منه استرداد طلب ماخدش عليه فلوس.
          order: { branch: { restaurantId }, status: OrderStatus.DELIVERED },
          liability: { in: RESTAURANT_BORNE },
          // بس اللي اتنفّذ — استرداد مستني موافقة أو مرفوض مايدخلش تسوية المطعم.
          status: { in: SETTLED_REFUND_STATUSES },
          settlementId: null,
          createdAt: { lte: periodEnd },
        },
        select: {
          id: true,
          amount: true,
          commissionReversed: true,
          reasonAr: true,
          order: { select: { orderNumber: true, total: true, subtotal: true, discount: true } },
        },
        orderBy: { createdAt: 'asc' },
      });

      if (!orders.length && !refunds.length) return null;

      // أقدم تاريخ داخل في الدورة = بداية الفترة (للعرض بس؛ التقسيم بالربط مش بالتاريخ).
      const periodStart = orders.length ? orders[0].placedAt : periodEnd;

      // الحسبة كلها في دالة نقية مختبَرة (`settlement-math.ts`) — الثابت
      // «netPayout = مجموع السطور» مضمون رياضياً هناك.
      const { grossSales, commission, refundsBorne, commissionReversed, netPayout, lines } = computeSettlement(
        orders.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          subtotal: o.subtotal.toString(),
          discount: o.discount.toString(),
          commission: o.commission.toString(),
        })),
        refunds.map((r) => ({
          id: r.id,
          amount: r.amount.toString(),
          commissionReversed: r.commissionReversed.toString(),
          orderTotal: r.order.total.toString(),
          orderFoodRevenue: r.order.subtotal.minus(r.order.discount).toString(),
          orderNumber: r.order.orderNumber,
          reasonAr: r.reasonAr,
        })),
      );

      const account = await tx.restaurantPayoutAccount.findUnique({ where: { restaurantId } });

      const settlement = await tx.settlement.create({
        data: {
          restaurantId,
          periodStart,
          periodEnd,
          grossSales: grossSales.toFixed(2),
          commission: commission.toFixed(2),
          refundsBorne: refundsBorne.toFixed(2),
          commissionReversed: commissionReversed.toFixed(2),
          netPayout: netPayout.toFixed(2),
          payoutRef: account ? this.maskIban(account.iban) : null,
          createdById: actorId,
          lines: { createMany: { data: lines } },
        },
      });

      await tx.order.updateMany({
        where: { id: { in: orders.map((o) => o.id) } },
        data: { settlementId: settlement.id },
      });
      await tx.refund.updateMany({
        where: { id: { in: refunds.map((r) => r.id) } },
        data: { settlementId: settlement.id },
      });

      return settlement.id;
    });
  }

  /**
   * تعليم تسوية إنها اتحوّلت.
   *
   * القفل على الصف مقصود: تأكيدين متزامنين كانوا هيسجّلوا حوالتين على نفس
   * التسوية. مافيش بوابة بنك مربوطة — التحويل بيتم بره النظام والأدمن بيسجّل
   * مرجع الحوالة هنا، فده سجل مش تنفيذ.
   */
  async transfer(user: AuthUser, id: string, dto: TransferSettlementDto) {
    this.assertAdmin(user);

    return this.prisma.$transaction(async (tx) => {
      // IDs نصّية (Prisma بتولّد uuid في التطبيق) — من غير cast لـ uuid.
      const [settlement] = await tx.$queryRaw<{ id: string; status: SettlementStatus }[]>`
        SELECT id, status FROM settlements WHERE id = ${id} FOR UPDATE`;
      if (!settlement) throw new NotFoundException('التسوية غير موجودة');
      if (settlement.status === SettlementStatus.TRANSFERRED) {
        throw new ConflictException('التسوية محوَّلة بالفعل');
      }

      const updated = await tx.settlement.update({
        where: { id },
        data: {
          status: SettlementStatus.TRANSFERRED,
          transferRef: dto.transferRef,
          transferredAt: new Date(),
        },
      });
      // جوه نفس المعاملة: لو التحويل اترجع، سجل التدقيق يترجع معاه.
      await this.audit.record(
        user,
        AuditAction.SETTLEMENT_TRANSFER,
        'settlement',
        id,
        `تحويل تسوية ${Number(updated.netPayout).toFixed(2)} ر.س — مرجع ${dto.transferRef}`,
        { netPayout: Number(updated.netPayout), transferRef: dto.transferRef, restaurantId: updated.restaurantId },
        tx,
      );
      return this.mapSettlement(updated);
    });
  }

  async list(user: AuthUser, status: SettlementStatus | undefined, page = 1, pageSize = 20) {
    this.assertAdmin(user);
    const where = status ? { status } : {};

    const [rows, total] = await Promise.all([
      this.prisma.settlement.findMany({
        where,
        include: { restaurant: { select: { nameAr: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.settlement.count({ where }),
    ]);

    return {
      data: rows.map((row) => ({ ...this.mapSettlement(row), restaurantName: row.restaurant.nameAr })),
      total,
      page,
      pageSize,
    };
  }

  async detail(user: AuthUser, id: string) {
    this.assertAdmin(user);
    const settlement = await this.prisma.settlement.findUnique({
      where: { id },
      include: {
        restaurant: { select: { nameAr: true } },
        lines: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!settlement) throw new NotFoundException('التسوية غير موجودة');

    return {
      ...this.mapSettlement(settlement),
      restaurantName: settlement.restaurant.nameAr,
      lines: settlement.lines.map((line) => ({
        id: line.id,
        type: line.type,
        amount: Number(line.amount),
        descriptionAr: line.descriptionAr,
      })),
    };
  }

  /**
   * حساب الاستلام — بيتعرض مقنّع، وبيرجّع `{ account: null }` لو مفيش.
   *
   * ملفوف في كائن عن قصد: NestJS بيحوّل `return null` لجسم فاضي (مش JSON null)،
   * فالعميل بيلاقي رد مبهم. الغلاف بيخلّي الرد JSON صريح دايماً.
   */
  async getPayoutAccount(user: AuthUser, restaurantId: string) {
    this.assertAdmin(user);
    const account = await this.prisma.restaurantPayoutAccount.findUnique({ where: { restaurantId } });
    return { account: account ? this.mapAccount(account) : null };
  }

  private mapAccount(account: {
    id: string;
    restaurantId: string;
    bankName: string;
    accountName: string;
    iban: string;
    updatedAt: Date;
  }) {
    return {
      id: account.id,
      restaurantId: account.restaurantId,
      bankName: account.bankName,
      accountName: account.accountName,
      iban: this.maskIban(account.iban),
      updatedAt: account.updatedAt.toISOString(),
    };
  }

  async savePayoutAccount(user: AuthUser, restaurantId: string, dto: SavePayoutAccountDto) {
    this.assertAdmin(user);
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) throw new NotFoundException('المطعم غير موجود');

    const iban = dto.iban.replace(/\s+/g, '').toUpperCase();
    if (!/^SA\d{22}$/.test(iban)) {
      throw new BadRequestException('الآيبان لازم يكون سعودي صحيح (SA + ٢٢ رقم)');
    }

    const account = await this.prisma.restaurantPayoutAccount.upsert({
      where: { restaurantId },
      create: { restaurantId, bankName: dto.bankName, accountName: dto.accountName, iban },
      update: { bankName: dto.bankName, accountName: dto.accountName, iban },
    });

    // بنسجّل آخر ٤ أرقام بس — نفس مبدأ التقنيع، السجل مايسربّش الآيبان الكامل.
    await this.audit.record(
      user,
      AuditAction.PAYOUT_ACCOUNT_SAVE,
      'restaurant',
      restaurantId,
      `تحديث حساب استلام ${restaurant.nameAr} — ${dto.bankName} ${this.maskIban(iban)}`,
      { restaurantId, bankName: dto.bankName, ibanMasked: this.maskIban(iban) },
    );

    return this.mapAccount(account);
  }

  private mapSettlement(settlement: {
    id: string;
    restaurantId: string;
    periodStart: Date;
    periodEnd: Date;
    grossSales: Prisma.Decimal;
    commission: Prisma.Decimal;
    refundsBorne: Prisma.Decimal;
    commissionReversed: Prisma.Decimal;
    netPayout: Prisma.Decimal;
    status: SettlementStatus;
    payoutRef: string | null;
    transferRef: string | null;
    transferredAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: settlement.id,
      restaurantId: settlement.restaurantId,
      periodStart: settlement.periodStart.toISOString(),
      periodEnd: settlement.periodEnd.toISOString(),
      grossSales: Number(settlement.grossSales),
      commission: Number(settlement.commission),
      refundsBorne: Number(settlement.refundsBorne),
      commissionReversed: Number(settlement.commissionReversed),
      netPayout: Number(settlement.netPayout),
      status: settlement.status,
      payoutRef: settlement.payoutRef,
      transferRef: settlement.transferRef,
      transferredAt: settlement.transferredAt?.toISOString() ?? null,
      createdAt: settlement.createdAt.toISOString(),
    };
  }

  /** «SA03 •••• 7519» — النص الكامل مابيخرجش من الـ API أبداً. */
  private maskIban(iban: string): string {
    const clean = iban.replace(/\s+/g, '');
    if (clean.length <= 8) return '••••';
    return `${clean.slice(0, 4)} •••• ${clean.slice(-4)}`;
  }

  private assertAdmin(user: AuthUser) {
    if (user.role !== UserRole.ADMIN) throw new ForbiddenException('التسويات متاحة للإدارة فقط');
  }
}
