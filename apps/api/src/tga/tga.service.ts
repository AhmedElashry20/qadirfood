import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditAction, Prisma, TgaStatus, type Captain } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.module';
import { TgaGateway } from './tga-gateway';
import { LinkTgaCardDto, TgaRosterQueryDto } from './tga.dto';
import type { AuthUser } from '../common';

interface Actor {
  userId: string;
  role: AuthUser['role'];
}

@Injectable()
export class TgaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly gateway: TgaGateway,
  ) {}

  // ── حالة ربط المنصة بالهيئة (رقم المنشأة + مزوّد التحقّق) ──
  async linkStatus() {
    const establishmentNumber = this.config.get<string>('TGA_ESTABLISHMENT_NUMBER') ?? null;
    const grouped = await this.prisma.captain.groupBy({ by: ['tgaStatus'], _count: true });
    const counts: Record<string, number> = {};
    for (const s of Object.values(TgaStatus)) counts[s] = 0;
    for (const g of grouped) counts[g.tgaStatus] = g._count;

    // عدّل EXPIRED المحسوبة (بطاقة موثّقة عدّى تاريخها) في العدّ كمان.
    const silentlyExpired = await this.prisma.captain.count({
      where: { tgaStatus: TgaStatus.VERIFIED, tgaCardExpiresAt: { lt: new Date() } },
    });
    counts[TgaStatus.VERIFIED] -= silentlyExpired;
    counts[TgaStatus.EXPIRED] += silentlyExpired;

    return {
      // مافيش ربط API مباشر — التحقّق يدوي لحد ما يتوفّر اعتماد من الهيئة.
      linked: this.gateway.linked,
      provider: this.gateway.name,
      establishmentNumber: establishmentNumber ? this.maskTail(establishmentNumber) : null,
      // علم صريح لو رقم المنشأة مش متظبّط في البيئة — اللوحة بتعرضه كتنبيه.
      establishmentConfigured: !!establishmentNumber,
      counts,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
    };
  }

  // ── روستر الكباتن + حالتهم مع الهيئة ──
  async roster(query: TgaRosterQueryDto) {
    const where: Prisma.CaptainWhereInput = {};
    if (query.status) where.tgaStatus = query.status;
    if (query.search?.trim()) {
      const s = query.search.trim();
      where.OR = [
        { user: { fullName: { contains: s, mode: 'insensitive' } } },
        { tgaCardNumber: { contains: s, mode: 'insensitive' } },
      ];
    }

    const captains = await this.prisma.captain.findMany({
      where,
      include: { user: { select: { fullName: true, phone: true } }, company: { select: { nameAr: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return captains.map((c) => this.toRow(c, c.user, c.company));
  }

  // ── ربط/تحديث بطاقة التوصيل — بيرجّعها PENDING لحد التحقّق ──
  async linkCard(actor: Actor, captainId: string, dto: LinkTgaCardDto) {
    const captain = await this.prisma.captain.findUnique({ where: { id: captainId } });
    if (!captain) throw new NotFoundException('الكابتن غير موجود');

    const expiresAt = new Date(dto.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) throw new BadRequestException('تاريخ انتهاء غير صالح');

    // رقم البطاقة فريد — لو متسجّل لكابتن تاني نرفض بدل ما نكسر قيد الـ unique.
    const clash = await this.prisma.captain.findFirst({
      where: { tgaCardNumber: dto.cardNumber, id: { not: captainId } },
      select: { id: true },
    });
    if (clash) throw new BadRequestException('رقم بطاقة التوصيل ده متسجّل لكابتن تاني');

    const updated = await this.prisma.captain.update({
      where: { id: captainId },
      data: {
        tgaCardNumber: dto.cardNumber.trim(),
        tgaCardExpiresAt: expiresAt,
        tgaStatus: TgaStatus.PENDING,
        tgaRejectReason: null,
        tgaCheckedAt: null,
      },
      include: { user: { select: { fullName: true, phone: true } }, company: { select: { nameAr: true } } },
    });

    await this.audit.record(
      actor,
      AuditAction.TGA_LINK,
      'captain',
      captainId,
      `ربط بطاقة توصيل هيئة النقل (${dto.cardNumber}) — بانتظار التحقّق`,
      { cardNumber: dto.cardNumber, expiresAt: dto.expiresAt },
    );

    return this.toRow(updated, updated.user, updated.company);
  }

  // ── تشغيل التحقّق عبر البوابة (يدوي دلوقتي) ──
  async verify(actor: Actor, captainId: string) {
    const captain = await this.prisma.captain.findUnique({ where: { id: captainId } });
    if (!captain) throw new NotFoundException('الكابتن غير موجود');
    if (!captain.tgaCardNumber) throw new BadRequestException('لازم تربط بطاقة توصيل الأول');

    const result = await this.gateway.verify({
      cardNumber: captain.tgaCardNumber,
      nationalId: captain.nationalId,
      plateNumber: captain.plateNumber,
      expiresAt: captain.tgaCardExpiresAt,
    });

    const status =
      result.status === 'VERIFIED'
        ? TgaStatus.VERIFIED
        : result.status === 'REJECTED'
          ? TgaStatus.REJECTED
          : TgaStatus.PENDING;

    const updated = await this.prisma.captain.update({
      where: { id: captainId },
      data: {
        tgaStatus: status,
        tgaCheckedAt: result.checkedAt,
        tgaRejectReason: result.reason ?? null,
      },
      include: { user: { select: { fullName: true, phone: true } }, company: { select: { nameAr: true } } },
    });

    await this.audit.record(
      actor,
      AuditAction.TGA_VERIFY,
      'captain',
      captainId,
      `تحقّق هيئة النقل (${this.gateway.name}) → ${status}${result.reason ? ` — ${result.reason}` : ''}`,
      { provider: result.provider, status, reason: result.reason, linked: this.gateway.linked },
    );

    return this.toRow(updated, updated.user, updated.company);
  }

  // ── فك الربط ──
  async unlink(actor: Actor, captainId: string) {
    const captain = await this.prisma.captain.findUnique({ where: { id: captainId } });
    if (!captain) throw new NotFoundException('الكابتن غير موجود');

    const updated = await this.prisma.captain.update({
      where: { id: captainId },
      data: {
        tgaCardNumber: null,
        tgaCardExpiresAt: null,
        tgaStatus: TgaStatus.NOT_LINKED,
        tgaRejectReason: null,
        tgaCheckedAt: null,
      },
      include: { user: { select: { fullName: true, phone: true } }, company: { select: { nameAr: true } } },
    });

    await this.audit.record(actor, AuditAction.TGA_UNLINK, 'captain', captainId, 'فك ربط بطاقة توصيل هيئة النقل');
    return this.toRow(updated, updated.user, updated.company);
  }

  // ── تقرير الهيئة — الكباتن الموثّقين وبطاقاتهم (للتصدير) ──
  async report() {
    const rows = await this.roster({});
    const effective = (r: ReturnType<TgaService['toRow']>) => r.status;
    return {
      generatedAt: new Date().toISOString(),
      provider: this.gateway.name,
      establishmentConfigured: !!this.config.get('TGA_ESTABLISHMENT_NUMBER'),
      verified: rows.filter((r) => effective(r) === TgaStatus.VERIFIED).length,
      total: rows.length,
      rows,
    };
  }

  // ── مساعدات ──

  /** بيحوّل صف كابتن لعرض + بيحسب EXPIRED لو البطاقة عدّى تاريخها. */
  private toRow(
    c: Captain,
    user: { fullName: string; phone: string },
    company: { nameAr: string } | null,
  ) {
    let status: TgaStatus = c.tgaStatus;
    // بطاقة موثّقة عدّى تاريخها = منتهية فعلياً حتى لو الحقل لسه VERIFIED.
    if (status === TgaStatus.VERIFIED && c.tgaCardExpiresAt && c.tgaCardExpiresAt.getTime() < Date.now()) {
      status = TgaStatus.EXPIRED;
    }
    const daysToExpiry = c.tgaCardExpiresAt
      ? Math.ceil((c.tgaCardExpiresAt.getTime() - Date.now()) / 86_400_000)
      : null;

    return {
      captainId: c.id,
      name: user.fullName,
      phone: user.phone,
      company: company?.nameAr ?? null,
      nationalId: this.maskTail(c.nationalId),
      plateNumber: c.plateNumber ?? null,
      cardNumber: c.tgaCardNumber ?? null,
      expiresAt: c.tgaCardExpiresAt?.toISOString() ?? null,
      daysToExpiry,
      status,
      rejectReason: c.tgaRejectReason ?? null,
      checkedAt: c.tgaCheckedAt?.toISOString() ?? null,
    };
  }

  /** يخفي كل الرقم إلا آخر ٣ خانات — نفس أسلوب تقنيع الآيبان في التدقيق. */
  private maskTail(value: string): string {
    if (value.length <= 3) return value;
    return `${'•'.repeat(Math.max(3, value.length - 3))}${value.slice(-3)}`;
  }
}
