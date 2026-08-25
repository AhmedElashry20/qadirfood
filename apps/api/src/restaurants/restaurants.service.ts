import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RestaurantStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingGateway } from '../tracking/tracking.gateway';

@Injectable()
export class RestaurantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TrackingGateway,
  ) {}

  // ── فتح / إغلاق / مشغول (شاشة ١١) ──

  /**
   * وضع «مشغول» بيزوّد وقت التحضير تلقائياً — بيتضاف في OrdersService.acceptOrder.
   * الزيادة لازم تكون بين ١٥ و ٣٠ دقيقة.
   */
  async setStatus(branchId: string, status: RestaurantStatus, busyExtraMinutes?: number) {
    if (status === RestaurantStatus.BUSY) {
      const extra = busyExtraMinutes ?? 15;
      if (extra < 15 || extra > 30) {
        throw new BadRequestException('زيادة وقت التحضير في وضع «مشغول» لازم تكون بين ١٥ و ٣٠ دقيقة');
      }
    }

    const branch = await this.prisma.branch.update({
      where: { id: branchId },
      data: {
        status,
        ...(status === RestaurantStatus.BUSY && busyExtraMinutes ? { busyExtraMinutes } : {}),
      },
    });

    this.gateway.emitBranchStatusChanged(branchId, status, branch.busyExtraMinutes);
    return branch;
  }

  // ── أوقات العمل (شاشة ١٠) ──

  async getWorkingHours(branchId: string) {
    return this.prisma.workingHour.findMany({
      where: { branchId },
      orderBy: [{ weekday: 'asc' }, { opensAt: 'asc' }],
    });
  }

  /**
   * بنستبدل الجدول كله مرة واحدة — أبسط من التعديل الجزئي، والجدول صغير.
   * اليوم الواحد ممكن يكون فيه أكتر من فترة (صباحية ومسائية) = أكتر من صف بنفس الـ weekday.
   */
  async setWorkingHours(
    branchId: string,
    hours: { weekday: number; opensAt: string; closesAt: string; isClosed?: boolean; isRamadan?: boolean }[],
  ) {
    for (const h of hours) {
      if (h.weekday < 0 || h.weekday > 6) throw new BadRequestException('يوم غير صحيح');
      if (!h.isClosed && h.opensAt >= h.closesAt) {
        throw new BadRequestException('وقت الفتح لازم يكون قبل وقت الإغلاق');
      }
    }

    await this.prisma.$transaction([
      this.prisma.workingHour.deleteMany({ where: { branchId } }),
      this.prisma.workingHour.createMany({
        data: hours.map((h) => ({ ...h, branchId })),
      }),
    ]);

    return this.getWorkingHours(branchId);
  }

  /** هل الفرع مفتوح دلوقتي حسب جدول أوقات العمل؟ (مستقل عن الإغلاق اليدوي). */
  async isBranchOpenNow(branchId: string, isRamadan = false): Promise<boolean> {
    const now = new Date();
    const weekday = now.getDay();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const slots = await this.prisma.workingHour.findMany({
      where: { branchId, weekday, isClosed: false, isRamadan },
    });

    return slots.some((s) => s.opensAt <= hhmm && hhmm <= s.closesAt);
  }

  async findBranch(id: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id },
      include: { restaurant: true, workingHours: true },
    });
    if (!branch) throw new NotFoundException('الفرع غير موجود');

    const point = await this.prisma.getPoint('branches', 'location', id);
    return { ...branch, lat: point?.lat, lng: point?.lng };
  }

  /** المطاعم القريبة من العميل — الترتيب بالأقرب عبر PostGIS. */
  async findNearbyBranches(lat: number, lng: number, radiusKm = 10) {
    return this.prisma.$queryRawUnsafe<
      { id: string; nameAr: string; status: string; rating: number; distanceKm: number }[]
    >(
      `SELECT b.id, b."nameAr", b.status, b.rating,
              ST_Distance(b.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000.0 AS "distanceKm"
       FROM branches b
       WHERE b."isActive" = true
         AND ST_DWithin(b.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3 * 1000)
       ORDER BY "distanceKm" ASC
       LIMIT 50`,
      lng,
      lat,
      radiusKm,
    );
  }

  // ── إدارة الفروع والمستخدمين (شاشة ١٣) ──

  async listBranches(restaurantId: string) {
    return this.prisma.branch.findMany({ where: { restaurantId }, orderBy: { nameAr: 'asc' } });
  }

  async listBranchUsers(branchId: string) {
    return this.prisma.merchantUser.findMany({
      where: { branchId },
      include: { user: { select: { id: true, fullName: true, phone: true, email: true, isActive: true } } },
    });
  }
}
