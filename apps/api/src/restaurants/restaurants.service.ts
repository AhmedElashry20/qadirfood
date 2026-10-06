import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, OrderStatus, Prisma, RestaurantStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { AuditService } from '../audit/audit.module';

@Injectable()
export class RestaurantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TrackingGateway,
    private readonly audit: AuditService,
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
  // ────────────────────── إدارة المطاعم من اللوحة ──────────────────────
  // الأدمن كان بيعرف الفروع من الطلبات بس: مطعم من غير طلبات كان غير موجود
  // بالنسبة للوحة، ومافيش طريقة تقفل فرع أو تعدّل عمولة.

  /**
   * قائمة المطاعم للأدمن — بفروعها وعمولتها وحجم تشغيلها.
   *
   * `orderCount` بيتجمّع لكل الصفحة في استعلام واحد، مش استعلام لكل فرع.
   */
  async adminListRestaurants(query: {
    q?: string;
    isActive?: boolean;
    page?: number;
    pageSize?: number;
  }) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const q = query.q?.trim();

    const where: Prisma.RestaurantWhereInput = {
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(q
        ? {
            OR: [
              { nameAr: { contains: q, mode: Prisma.QueryMode.insensitive } },
              { nameEn: { contains: q, mode: Prisma.QueryMode.insensitive } },
              { contactPhone: { contains: q } },
            ],
          }
        : {}),
    };

    const [restaurants, total] = await this.prisma.$transaction([
      this.prisma.restaurant.findMany({
        where,
        include: {
          branches: {
            select: {
              id: true,
              nameAr: true,
              city: true,
              status: true,
              isActive: true,
              deliveryFee: true,
              minOrderTotal: true,
              avgPrepMinutes: true,
              rating: true,
              ratingCount: true,
            },
            orderBy: { nameAr: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.restaurant.count({ where }),
    ]);

    const branchIds = restaurants.flatMap((r) => r.branches.map((b) => b.id));
    const counts = branchIds.length
      ? await this.prisma.order.groupBy({
          by: ['branchId'],
          where: { branchId: { in: branchIds }, status: OrderStatus.DELIVERED },
          _count: { _all: true },
        })
      : [];
    const byBranch = new Map(counts.map((c) => [c.branchId, c._count._all]));

    const data = restaurants.map((r) => ({
      id: r.id,
      nameAr: r.nameAr,
      nameEn: r.nameEn,
      cuisineAr: r.cuisineAr,
      logoUrl: r.logoUrl,
      contactPhone: r.contactPhone,
      commissionRate: Number(r.commissionRate),
      isActive: r.isActive,
      createdAt: r.createdAt,
      branches: r.branches.map((b) => ({
        ...b,
        deliveryFee: Number(b.deliveryFee),
        minOrderTotal: Number(b.minOrderTotal),
        rating: Number(b.rating),
        deliveredOrders: byBranch.get(b.id) ?? 0,
      })),
      deliveredOrders: r.branches.reduce((sum, b) => sum + (byBranch.get(b.id) ?? 0), 0),
    }));

    return { data, total, page, pageSize };
  }

  /**
   * تعديل نسبة عمولة المنصة على مطعم.
   *
   * مابيأثّرش على طلبات قديمة: كل طلب بيخزّن عمولته وقت الإنشاء (`orders.commission`)،
   * فالتسويات المقفولة والتقارير التاريخية ثابتة. النسبة الجديدة بتسري على
   * الطلبات الجديدة بس.
   */
  async adminSetCommission(restaurantId: string, rate: number, adminUserId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { nameAr: true, commissionRate: true },
    });
    if (!restaurant) throw new NotFoundException('المطعم غير موجود');

    const before = Number(restaurant.commissionRate);
    const updated = await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: { commissionRate: rate.toFixed(2) },
      select: { id: true, commissionRate: true },
    });

    await this.audit.record(
      { userId: adminUserId, role: UserRole.ADMIN },
      AuditAction.RESTAURANT_COMMISSION,
      'restaurant',
      restaurantId,
      `تعديل عمولة ${restaurant.nameAr} من ${before}% إلى ${rate}%`,
      { before, after: rate },
    );

    return { id: updated.id, commissionRate: Number(updated.commissionRate) };
  }

  /**
   * تفعيل/إيقاف مطعم — الإيقاف بيقفل كل فروعه كمان، وإلا المطعم يبقى «موقوف»
   * وفروعه لسه بتستقبل طلبات.
   */
  async adminSetRestaurantActive(restaurantId: string, isActive: boolean, adminUserId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { nameAr: true, isActive: true },
    });
    if (!restaurant) throw new NotFoundException('المطعم غير موجود');

    await this.prisma.$transaction(async (tx) => {
      await tx.restaurant.update({ where: { id: restaurantId }, data: { isActive } });
      if (!isActive) {
        await tx.branch.updateMany({
          where: { restaurantId },
          data: { status: RestaurantStatus.CLOSED },
        });
      }
      await this.audit.record(
        { userId: adminUserId, role: UserRole.ADMIN },
        AuditAction.RESTAURANT_TOGGLE,
        'restaurant',
        restaurantId,
        `${isActive ? 'تفعيل' : 'إيقاف'} المطعم ${restaurant.nameAr}`,
        { isActive },
        tx,
      );
    });

    return { id: restaurantId, isActive };
  }

  /** فتح/إغلاق فرع من اللوحة — نفس منطق المطعم، بسطر تدقيق. */
  async adminSetBranchStatus(
    branchId: string,
    status: RestaurantStatus,
    adminUserId: string,
    busyExtraMinutes?: number,
  ) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { nameAr: true, status: true },
    });
    if (!branch) throw new NotFoundException('الفرع غير موجود');

    const result = await this.setStatus(branchId, status, busyExtraMinutes);

    await this.audit.record(
      { userId: adminUserId, role: UserRole.ADMIN },
      AuditAction.RESTAURANT_TOGGLE,
      'branch',
      branchId,
      `تغيير حالة فرع ${branch.nameAr} من ${branch.status} إلى ${status}`,
      { before: branch.status, after: status },
    );

    return result;
  }

}
