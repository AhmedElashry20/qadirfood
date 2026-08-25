import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, DocumentType, FaceCheckStatus, type FaceCheck } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.module';
import { FaceGateway } from './face-gateway';
import type { AuthUser } from '../common';

@Injectable()
export class FaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: FaceGateway,
    private readonly audit: AuditService,
  ) {}

  // ── المندوب بيرفع سيلفي التحقق اليومي ──
  async submit(captainId: string, selfieUrl: string) {
    if (!selfieUrl?.trim()) throw new BadRequestException('لازم ترفع صورة سيلفي');

    // الوجه المرجعي = وثيقة PHOTO المعتمدة (لو موجودة).
    const photo = await this.prisma.captainDocument.findFirst({
      where: { captainId, type: DocumentType.PHOTO },
      select: { fileUrl: true },
    });

    const result = await this.gateway.match({ captainId, selfieUrl, referenceUrl: photo?.fileUrl ?? null });
    const status =
      result.status === 'VERIFIED'
        ? FaceCheckStatus.VERIFIED
        : result.status === 'REJECTED'
          ? FaceCheckStatus.REJECTED
          : FaceCheckStatus.PENDING;

    const now = new Date();
    const check = await this.prisma.$transaction(async (tx) => {
      const created = await tx.faceCheck.create({
        data: {
          captainId,
          selfieUrl: selfieUrl.trim(),
          status,
          confidence: result.confidence,
          provider: result.provider,
          rejectReason: result.reason ?? null,
          checkedAt: status === FaceCheckStatus.PENDING ? null : now,
        },
      });
      // الفحص الموثّق بيحدّث ختم التحقق بالوجه على المندوب.
      if (status === FaceCheckStatus.VERIFIED) {
        await tx.captain.update({ where: { id: captainId }, data: { faceVerifiedAt: now } });
      }
      return created;
    });

    return { ...this.toView(check), biometricConfigured: result.biometricConfigured, provider: result.provider };
  }

  // ── حالة تحقّق المندوب النهاردة ──
  async todayStatus(captainId: string) {
    const check = await this.latestToday(captainId);
    return {
      // مطلوب فحص موثّق كل يوم — ده اللي بيتفحص قبل ما يشتغل.
      verifiedToday: check?.status === FaceCheckStatus.VERIFIED,
      required: true,
      biometricConfigured: this.gateway.biometricConfigured,
      provider: this.gateway.name,
      check: check ? this.toView(check) : null,
    };
  }

  /** هل المندوب عنده فحص موثّق النهاردة — يستخدمه بدء الوردية والتوزيع. */
  async hasVerifiedToday(captainId: string): Promise<boolean> {
    const check = await this.latestToday(captainId);
    return check?.status === FaceCheckStatus.VERIFIED;
  }

  // ── روستر الأدمن: حالة كل مندوب النهاردة ──
  async roster() {
    const captains = await this.prisma.captain.findMany({
      select: {
        id: true,
        user: { select: { fullName: true, phone: true } },
        faceChecks: {
          where: { createdAt: { gte: this.startOfToday() } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return captains.map((c) => {
      const check = c.faceChecks[0];
      return {
        captainId: c.id,
        name: c.user.fullName,
        phone: c.user.phone,
        checkId: check?.id ?? null,
        status: check?.status ?? 'MISSING',
        checkedAt: check?.checkedAt?.toISOString() ?? null,
        selfieUrl: check?.selfieUrl ?? null,
        provider: check?.provider ?? null,
      };
    });
  }

  // ── مراجعة أدمن لسيلفي اليوم — طبقة التحقق البشرية (المطابقة البيومترية stub) ──
  async review(actor: AuthUser, checkId: string, approve: boolean, reason?: string) {
    const check = await this.prisma.faceCheck.findUnique({ where: { id: checkId } });
    if (!check) throw new NotFoundException('الفحص غير موجود');
    if (!approve && !reason?.trim()) throw new BadRequestException('سبب الرفض إلزامي');

    const status = approve ? FaceCheckStatus.VERIFIED : FaceCheckStatus.REJECTED;
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.faceCheck.update({
        where: { id: checkId },
        data: {
          status,
          checkedAt: now,
          provider: `${check.provider}+admin`,
          rejectReason: approve ? null : reason!.trim(),
        },
      });
      // الاعتماد بيثبّت ختم التحقق، والرفض بيلغيه فالمندوب مايقدرش يشتغل النهاردة.
      await tx.captain.update({
        where: { id: check.captainId },
        data: { faceVerifiedAt: approve ? now : null },
      });
    });

    await this.audit.record(
      { userId: actor.userId, role: actor.role },
      AuditAction.FACE_REVIEW,
      'captain',
      check.captainId,
      approve ? 'اعتماد سيلفي التحقق اليومي' : `رفض سيلفي التحقق اليومي — ${reason}`,
      { checkId, approve, reason: reason ?? null },
    );

    const fresh = await this.prisma.faceCheck.findUniqueOrThrow({ where: { id: checkId } });
    return this.toView(fresh);
  }

  // ── مساعدات ──
  private async latestToday(captainId: string): Promise<FaceCheck | null> {
    return this.prisma.faceCheck.findFirst({
      where: { captainId, createdAt: { gte: this.startOfToday() } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private startOfToday(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  private toView(c: FaceCheck) {
    return {
      id: c.id,
      status: c.status,
      confidence: c.confidence,
      selfieUrl: c.selfieUrl,
      rejectReason: c.rejectReason,
      checkedAt: c.checkedAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    };
  }
}
