import { Injectable } from '@nestjs/common';
import { OrderStatus, RefundLiability } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SETTLED_REFUND_STATUSES } from '../payments/payments.service';

type Range = 'today' | 'week' | 'month';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private rangeToDates(range: Range): { from: Date; to: Date } {
    const to = new Date();
    const from = new Date();

    if (range === 'today') from.setHours(0, 0, 0, 0);
    else if (range === 'week') from.setDate(from.getDate() - 7);
    else from.setMonth(from.getMonth() - 1);

    return { from, to };
  }

  /** تقرير المطعم الكامل (شاشة ١٢) — شكله مطابق لـ MerchantReportDto. */
  async merchantReport(branchId: string, range: Range) {
    const { from, to } = this.rangeToDates(range);
    const where = { branchId, placedAt: { gte: from, lte: to } };

    const [delivered, allCount, rejectedCount, cancelledCount] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where: { ...where, status: OrderStatus.DELIVERED },
        select: { total: true, commission: true, placedAt: true },
      }),
      this.prisma.order.count({ where }),
      this.prisma.order.count({ where: { ...where, status: OrderStatus.REJECTED } }),
      this.prisma.order.count({ where: { ...where, status: OrderStatus.CANCELLED } }),
    ]);

    const totalSales = delivered.reduce((sum, o) => sum + Number(o.total), 0);
    const totalCommission = delivered.reduce((sum, o) => sum + Number(o.commission), 0);
    const orderCount = delivered.length;

    // الأصناف الأكثر مبيعاً — من order_items (الـ snapshot)، مش من المنيو الحالي
    const topItems = await this.prisma.orderItem.groupBy({
      by: ['menuItemId', 'nameAr'],
      where: { order: { ...where, status: OrderStatus.DELIVERED } },
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 10,
    });

    // المبيعات باليوم للرسم البياني
    const salesByDay = await this.prisma.$queryRawUnsafe<{ date: string; sales: number; orders: bigint }[]>(
      `SELECT to_char("placedAt", 'YYYY-MM-DD') AS date,
              COALESCE(SUM(total), 0)::float AS sales,
              COUNT(*) AS orders
       FROM orders
       WHERE "branchId" = $1 AND status = 'DELIVERED' AND "placedAt" BETWEEN $2 AND $3
       GROUP BY 1
       ORDER BY 1 ASC`,
      branchId,
      from,
      to,
    );

    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    const settlement = await this.prisma.settlement.findFirst({
      where: { restaurantId: branch!.restaurantId },
      orderBy: { periodStart: 'desc' },
    });

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      totalSales: Number(totalSales.toFixed(2)),
      orderCount,
      avgOrderValue: orderCount ? Number((totalSales / orderCount).toFixed(2)) : 0,
      rejectionRate: allCount ? Number(((rejectedCount / allCount) * 100).toFixed(1)) : 0,
      cancellationRate: allCount ? Number(((cancelledCount / allCount) * 100).toFixed(1)) : 0,
      topItems: topItems.map((t) => ({
        menuItemId: t.menuItemId,
        nameAr: t.nameAr,
        count: t._sum.quantity ?? 0,
        revenue: Number(t._sum.lineTotal ?? 0),
      })),
      salesByDay: salesByDay.map((d) => ({ date: d.date, sales: d.sales, orders: Number(d.orders) })),
      settlement: {
        netPayout: settlement ? Number(settlement.netPayout) : Number((totalSales - totalCommission).toFixed(2)),
        commission: settlement ? Number(settlement.commission) : Number(totalCommission.toFixed(2)),
        status: settlement?.status ?? 'PENDING',
        transferredAt: settlement?.transferredAt?.toISOString(),
      },
    };
  }

  /** لوحة الأدمن — مؤشرات المنصة كلها. */
  async platformReport(range: Range) {
    const { from, to } = this.rangeToDates(range);
    const where = { placedAt: { gte: from, lte: to } };

    const [orders, delivered, activeCaptains, activeBranches] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where: { ...where, status: OrderStatus.DELIVERED },
        select: { total: true, commission: true, captainPayout: true },
      }),
      this.prisma.captain.count({ where: { status: { in: ['ONLINE', 'ON_TRIP'] } } }),
      this.prisma.branch.count({ where: { status: { in: ['OPEN', 'BUSY'] } } }),
    ]);

    const gmv = delivered.reduce((s, o) => s + Number(o.total), 0);
    const revenue = delivered.reduce((s, o) => s + Number(o.commission), 0);
    const captainCost = delivered.reduce((s, o) => s + Number(o.captainPayout), 0);

    // الاسترداد بيقلّل المبيعات الفعلية. بنعرضه سطر لوحده بدل ما نطرحه من `gmv`
    // في السكوت: `gmv` إجمالي زي ما هو، و`netGmv` بعد الاسترداد — عشان اللي
    // بيقرا التقرير يشوف الفرق مش رقم واحد اتغيّر من ورا ظهره.
    //
    // والعمولة: بترجع بس على الاستردادات اللي جهة تحمّلها المطعم أو «مافيش»
    // (`Refund.commissionReversed` بيتحسب وقت الاسترداد بنسبة عمولة ساعتها).
    // لو الغلط من المنصة أو الكابتن، المطعم أخد مستحقه والعمولة مابترجعش.
    // بنجمّع الاسترداد حسب جهة التحمّل مش رقم واحد: التوزيع الصح على المطاعم
    // بيفرّق بين اللي المطعم اتحمّله (بيقلّل مستحقاته) واللي المنصة/الكابتن
    // اتحمّلوه (المطعم أخد مستحقه كامل ومايتخصمش منه).
    const refundsByLiability = await this.prisma.refund.groupBy({
      by: ['liability'],
      _sum: { amount: true, commissionReversed: true },
      where: {
        // بس اللي اتنفّذ فعلاً — المستني موافقة والمرفوض مش فلوس خرجت.
        status: { in: SETTLED_REFUND_STATUSES },
        order: { ...where, status: OrderStatus.DELIVERED },
      },
    });

    const sumWhere = (predicate: (l: RefundLiability) => boolean) =>
      refundsByLiability
        .filter((row) => predicate(row.liability))
        .reduce((s, row) => s + Number(row._sum.amount ?? 0), 0);

    const refundedTotal = sumWhere(() => true);
    const commissionReversed = refundsByLiability.reduce((s, row) => s + Number(row._sum.commissionReversed ?? 0), 0);
    // اللي بيقلّل مبيعات المطعم فعلاً: تحمّل المطعم أو «مافيش». تحمّل المنصة
    // أو الكابتن مابيمسّش مستحقات المطعم.
    const refundedFromRestaurant = sumWhere(
      (l) => l === RefundLiability.NONE || l === RefundLiability.RESTAURANT,
    );
    const netRevenue = revenue - commissionReversed;

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      orderCount: orders,
      deliveredCount: delivered.length,
      gmv: Number(gmv.toFixed(2)),
      refundedTotal: Number(refundedTotal.toFixed(2)),
      /// اللي المطعم اتحمّله بس — ده اللي بيتخصم من مستحقاته، مش إجمالي الاسترداد.
      refundedFromRestaurant: Number(refundedFromRestaurant.toFixed(2)),
      netGmv: Number((gmv - refundedTotal).toFixed(2)),
      /// العمولة الإجمالية قبل رجوع أي جزء منها.
      revenue: Number(revenue.toFixed(2)),
      commissionReversed: Number(commissionReversed.toFixed(2)),
      /// العمولة اللي المنصة كسبتها فعلاً — دي اللي التسوية بتتبني عليها.
      netRevenue: Number(netRevenue.toFixed(2)),
      /// مستحقات المطاعم الصح: مبيعاتهم بعد استرداداتهم هم، ناقص صافي العمولة.
      restaurantDues: Number((gmv - refundedFromRestaurant - netRevenue).toFixed(2)),
      captainCost: Number(captainCost.toFixed(2)),
      netMargin: Number((netRevenue - captainCost).toFixed(2)),
      activeCaptains,
      activeBranches,
    };
  }

  // ────────────────────────────────────────────────────────────
  // تحليلات BI — كلها من بيانات حقيقية، صفر أرقام مخترعة
  // ────────────────────────────────────────────────────────────

  /**
   * سلسلة زمنية للطلبات والإيراد — بالساعة لليوم، وباليوم للأسبوع/الشهر.
   * ده اللي الرسم البياني الرئيسي في اللوحة بيتبني عليه.
   */
  async timeseries(range: Range) {
    const { from, to } = this.rangeToDates(range);
    const bucket = range === 'today' ? 'hour' : 'day';
    const fmt = bucket === 'hour' ? 'YYYY-MM-DD"T"HH24:00:00' : 'YYYY-MM-DD';

    const rows = await this.prisma.$queryRawUnsafe<
      { bucket: string; orders: bigint; delivered: bigint; gmv: number; revenue: number }[]
    >(
      `SELECT to_char(date_trunc('${bucket}', "placedAt"), '${fmt}') AS bucket,
              COUNT(*) AS orders,
              COUNT(*) FILTER (WHERE status = 'DELIVERED') AS delivered,
              COALESCE(SUM(total) FILTER (WHERE status = 'DELIVERED'), 0)::float AS gmv,
              COALESCE(SUM(commission) FILTER (WHERE status = 'DELIVERED'), 0)::float AS revenue
       FROM orders
       WHERE "placedAt" BETWEEN $1 AND $2
       GROUP BY 1 ORDER BY 1 ASC`,
      from,
      to,
    );

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      bucket,
      points: rows.map((r) => ({
        bucket: r.bucket,
        orders: Number(r.orders),
        delivered: Number(r.delivered),
        gmv: Number(r.gmv.toFixed(2)),
        revenue: Number(r.revenue.toFixed(2)),
      })),
    };
  }

  /**
   * لوحة تحليلات شاملة: قمع التحويل، ساعات الذروة، أفضل المطاعم والأصناف،
   * مزيج الدفع، توزيع الحالات، ومؤشرات الكباتن — كلها للفترة المطلوبة.
   */
  async analytics(range: Range) {
    const { from, to } = this.rangeToDates(range);
    const where = { placedAt: { gte: from, lte: to } };

    const [
      statusGroups,
      paymentGroups,
      topItems,
      byHour,
      ratingAgg,
      newCustomers,
    ] = await Promise.all([
      this.prisma.order.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.order.groupBy({
        by: ['paymentMethod'],
        where: { ...where, status: OrderStatus.DELIVERED },
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.prisma.orderItem.groupBy({
        by: ['menuItemId', 'nameAr'],
        where: { order: { ...where, status: OrderStatus.DELIVERED } },
        _sum: { quantity: true, lineTotal: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 8,
      }),
      this.prisma.$queryRawUnsafe<{ hour: number; orders: bigint }[]>(
        `SELECT EXTRACT(HOUR FROM "placedAt")::int AS hour, COUNT(*) AS orders
         FROM orders WHERE "placedAt" BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 1`,
        from,
        to,
      ),
      this.prisma.review.aggregate({
        _avg: { restaurantStars: true, captainStars: true },
        _count: { _all: true },
        where: { order: where },
      }),
      this.prisma.customer.count({ where: { user: { createdAt: { gte: from, lte: to } } } }),
    ]);

    const statusCount = (s: OrderStatus) => statusGroups.find((g) => g.status === s)?._count._all ?? 0;
    const total = statusGroups.reduce((sum, g) => sum + g._count._all, 0);
    const delivered = statusCount(OrderStatus.DELIVERED);
    const cancelled = statusCount(OrderStatus.CANCELLED) + statusCount(OrderStatus.REJECTED);
    // قمع التحويل: كل طلب مرّ بالمراحل دي — «قبل التحضير» يعني اتقبل أو أبعد.
    const acceptedPlus =
      total -
      statusCount(OrderStatus.PENDING) -
      statusCount(OrderStatus.REJECTED) -
      statusCount(OrderStatus.CANCELLED);
    const inDeliveryPlus =
      statusCount(OrderStatus.CAPTAIN_ASSIGNED) +
      statusCount(OrderStatus.PICKED_UP) +
      statusCount(OrderStatus.ON_THE_WAY) +
      delivered;

    // أفضل المطاعم — من الطلبات المسلّمة، بالاسم والفرع.
    const topBranchesRaw = await this.prisma.$queryRawUnsafe<
      { branchId: string; nameAr: string; restaurantAr: string; orders: bigint; revenue: number }[]
    >(
      `SELECT b.id AS "branchId", b."nameAr", r."nameAr" AS "restaurantAr",
              COUNT(o.*) AS orders, COALESCE(SUM(o.total),0)::float AS revenue
       FROM orders o JOIN branches b ON b.id = o."branchId" JOIN restaurants r ON r.id = b."restaurantId"
       WHERE o.status = 'DELIVERED' AND o."placedAt" BETWEEN $1 AND $2
       GROUP BY b.id, b."nameAr", r."nameAr" ORDER BY revenue DESC LIMIT 6`,
      from,
      to,
    );

    const avgOrderValue = delivered
      ? Number(
          (
            paymentGroups.reduce((s, g) => s + Number(g._sum.total ?? 0), 0) / delivered
          ).toFixed(2),
        )
      : 0;

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      kpis: {
        totalOrders: total,
        deliveredOrders: delivered,
        cancelledOrders: cancelled,
        completionRate: total ? Number(((delivered / total) * 100).toFixed(1)) : 0,
        cancellationRate: total ? Number(((cancelled / total) * 100).toFixed(1)) : 0,
        avgOrderValue,
        newCustomers,
        avgRestaurantRating: ratingAgg._avg.restaurantStars ? Number(ratingAgg._avg.restaurantStars.toFixed(2)) : null,
        avgCaptainRating: ratingAgg._avg.captainStars ? Number(ratingAgg._avg.captainStars.toFixed(2)) : null,
        reviewCount: ratingAgg._count._all,
      },
      funnel: [
        { stage: 'الطلبات', count: total },
        { stage: 'اتقبلت', count: acceptedPlus },
        { stage: 'خرجت للتوصيل', count: inDeliveryPlus },
        { stage: 'اتسلّمت', count: delivered },
      ],
      statusBreakdown: statusGroups.map((g) => ({ status: g.status, count: g._count._all })),
      paymentMix: paymentGroups.map((g) => ({
        method: g.paymentMethod,
        count: g._count._all,
        total: Number((Number(g._sum.total ?? 0)).toFixed(2)),
      })),
      ordersByHour: Array.from({ length: 24 }, (_, h) => ({
        hour: h,
        orders: Number(byHour.find((r) => r.hour === h)?.orders ?? 0),
      })),
      topBranches: topBranchesRaw.map((b) => ({
        branchId: b.branchId,
        nameAr: b.nameAr,
        restaurantAr: b.restaurantAr,
        orders: Number(b.orders),
        revenue: Number(b.revenue.toFixed(2)),
      })),
      topItems: topItems.map((t) => ({
        menuItemId: t.menuItemId,
        nameAr: t.nameAr,
        quantity: t._sum.quantity ?? 0,
        revenue: Number((Number(t._sum.lineTotal ?? 0)).toFixed(2)),
      })),
    };
  }

  /**
   * لقطة حيّة للخريطة: مواقع الكباتن (آخر موقع معروف + حالتهم) والطلبات النشطة
   * (نقطة الفرع + نقطة التسليم + حالتها). الخريطة بتبدأ بيها وبعدين السوكيت
   * بيحرّك الكباتن لايف.
   */
  async liveMap() {
    const captains = await this.prisma.captain.findMany({
      where: { status: { in: ['ONLINE', 'ON_TRIP'] } },
      select: { id: true, status: true, vehicleType: true, user: { select: { fullName: true } } },
    });
    const captainPoints = await Promise.all(
      captains.map(async (c) => {
        const pt = await this.prisma.getPoint('captains', 'lastLocation', c.id);
        return pt
          ? {
              captainId: c.id,
              name: c.user.fullName,
              status: c.status,
              vehicleType: c.vehicleType,
              location: pt,
            }
          : null;
      }),
    );

    const active = await this.prisma.order.findMany({
      where: {
        status: {
          in: [
            OrderStatus.ACCEPTED,
            OrderStatus.PREPARING,
            OrderStatus.READY,
            OrderStatus.CAPTAIN_ASSIGNED,
            OrderStatus.PICKED_UP,
            OrderStatus.ON_THE_WAY,
          ],
        },
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        branchId: true,
        addressId: true,
        captainId: true,
        branch: { select: { nameAr: true } },
      },
      take: 100,
    });
    const orderPoints = await Promise.all(
      active.map(async (o) => {
        const branch = await this.prisma.getPoint('branches', 'location', o.branchId);
        const dropoff = await this.prisma.getPoint('addresses', 'location', o.addressId);
        return {
          orderId: o.id,
          orderNumber: o.orderNumber,
          status: o.status,
          branchAr: o.branch.nameAr,
          captainId: o.captainId,
          branch,
          dropoff,
        };
      }),
    );

    return {
      at: new Date().toISOString(),
      captains: captainPoints.filter(Boolean),
      activeOrders: orderPoints,
    };
  }
}
