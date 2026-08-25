import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

type Range = 'today' | 'week' | 'month' | 'all';

/** تقييم منخفض للمطعم = نجمتين أو أقل (شكوى تستدعي متابعة). */
const LOW_STARS = 2;

@Injectable()
export class QualityService {
  constructor(private readonly prisma: PrismaService) {}

  // ── نظرة عامة على الجودة (توزيعات + أسوأ أداء + أحدث شكاوى + اتجاه) ──
  async overview(range: Range = 'month') {
    const since = this.rangeStart(range);
    const where: Prisma.ReviewWhereInput = since ? { createdAt: { gte: since } } : {};

    const [total, agg, restaurantDist, captainDistRaw, lowRated, withComment] = await Promise.all([
      this.prisma.review.count({ where }),
      this.prisma.review.aggregate({ where, _avg: { restaurantStars: true, captainStars: true } }),
      this.prisma.review.groupBy({ by: ['restaurantStars'], where, _count: true }),
      this.prisma.review.groupBy({
        by: ['captainStars'],
        where: { ...where, captainStars: { not: null } },
        _count: true,
      }),
      this.prisma.review.count({ where: { ...where, restaurantStars: { lte: LOW_STARS } } }),
      this.prisma.review.count({ where: { ...where, comment: { not: null } } }),
    ]);

    // توزيع النجوم ١..٥ (نملأ الفاضي بصفر).
    const restaurantDistribution = this.fillStars(restaurantDist.map((d) => ({ stars: d.restaurantStars, count: d._count })));
    const captainDistribution = this.fillStars(
      captainDistRaw.map((d) => ({ stars: d.captainStars ?? 0, count: d._count })),
    );

    // أسوأ الفروع والكباتن (بحد أدنى تقييمات عشان مايبقاش تقييم يتيم).
    const [worstBranches, worstCaptains] = await Promise.all([
      this.prisma.branch.findMany({
        where: { ratingCount: { gt: 0 } },
        orderBy: { rating: 'asc' },
        take: 6,
        select: { id: true, nameAr: true, rating: true, ratingCount: true },
      }),
      this.prisma.captain.findMany({
        where: { ratingCount: { gt: 0 } },
        orderBy: { rating: 'asc' },
        take: 6,
        select: { id: true, rating: true, ratingCount: true, user: { select: { fullName: true } } },
      }),
    ]);

    // أحدث الشكاوى (تقييم منخفض وعليه تعليق) — الأهم لفريق الجودة.
    const recentLow = await this.prisma.review.findMany({
      where: { ...where, restaurantStars: { lte: 3 }, comment: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 12,
      include: {
        order: { select: { orderNumber: true, branch: { select: { nameAr: true } } } },
        customer: { select: { user: { select: { fullName: true } } } },
      },
    });

    const trend = await this.trend(range, since);

    return {
      range,
      summary: {
        totalReviews: total,
        avgRestaurant: this.round(agg._avg.restaurantStars),
        avgCaptain: this.round(agg._avg.captainStars),
        lowRated,
        lowRatedPct: total ? Math.round((lowRated / total) * 100) : 0,
        commentCount: withComment,
      },
      restaurantDistribution,
      captainDistribution,
      worstBranches: worstBranches.map((b) => ({
        id: b.id,
        nameAr: b.nameAr,
        rating: Number(b.rating),
        ratingCount: b.ratingCount,
      })),
      worstCaptains: worstCaptains.map((c) => ({
        id: c.id,
        name: c.user.fullName,
        rating: Number(c.rating),
        ratingCount: c.ratingCount,
      })),
      recentComplaints: recentLow.map((r) => ({
        id: r.id,
        restaurantStars: r.restaurantStars,
        captainStars: r.captainStars,
        comment: r.comment,
        orderNumber: r.order.orderNumber,
        branch: r.order.branch?.nameAr ?? null,
        customer: r.customer.user.fullName,
        createdAt: r.createdAt.toISOString(),
      })),
      trend,
    };
  }

  // ── قائمة التقييمات مع فلاتر (للتفصيل) ──
  async reviews(query: {
    stars?: number;
    maxStars?: number;
    branchId?: string;
    captainId?: string;
    hasComment?: boolean;
    search?: string;
    range?: Range;
  }) {
    const since = this.rangeStart(query.range ?? 'all');
    const where: Prisma.ReviewWhereInput = {};
    if (since) where.createdAt = { gte: since };
    if (query.stars) where.restaurantStars = query.stars;
    else if (query.maxStars) where.restaurantStars = { lte: query.maxStars };
    if (query.hasComment) where.comment = { not: null };
    if (query.branchId) where.order = { ...(where.order as object), branchId: query.branchId };
    if (query.captainId) where.order = { ...(where.order as object), captainId: query.captainId };
    if (query.search?.trim()) {
      const s = query.search.trim();
      where.OR = [
        { comment: { contains: s, mode: 'insensitive' } },
        { order: { orderNumber: { contains: s, mode: 'insensitive' } } },
      ];
    }

    const reviews = await this.prisma.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        order: {
          select: {
            orderNumber: true,
            branch: { select: { nameAr: true } },
            captain: { select: { user: { select: { fullName: true } } } },
          },
        },
        customer: { select: { user: { select: { fullName: true } } } },
      },
    });

    return reviews.map((r) => ({
      id: r.id,
      restaurantStars: r.restaurantStars,
      captainStars: r.captainStars,
      comment: r.comment,
      orderNumber: r.order.orderNumber,
      branch: r.order.branch?.nameAr ?? null,
      captain: r.order.captain?.user.fullName ?? null,
      customer: r.customer.user.fullName,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // ── مساعدات ──

  private async trend(range: Range, since: Date | null) {
    // اتجاه يومي (أو بالساعة لليوم) لمتوسط التقييم وعدد المراجعات.
    const bucket = range === 'today' ? 'hour' : 'day';
    const rows = await this.prisma.$queryRaw<
      { bucket: Date; avg_restaurant: number | null; avg_captain: number | null; cnt: bigint }[]
    >(Prisma.sql`
      SELECT date_trunc(${bucket}, "createdAt") AS bucket,
             AVG("restaurantStars")::float AS avg_restaurant,
             AVG("captainStars")::float AS avg_captain,
             COUNT(*)::bigint AS cnt
      FROM reviews
      ${since ? Prisma.sql`WHERE "createdAt" >= ${since}` : Prisma.empty}
      GROUP BY 1
      ORDER BY 1 ASC
    `);
    return rows.map((r) => ({
      bucket: r.bucket.toISOString(),
      avgRestaurant: this.round(r.avg_restaurant),
      avgCaptain: this.round(r.avg_captain),
      count: Number(r.cnt),
    }));
  }

  private fillStars(rows: { stars: number; count: number }[]) {
    const map = new Map(rows.map((r) => [r.stars, r.count]));
    return [1, 2, 3, 4, 5].map((stars) => ({ stars, count: map.get(stars) ?? 0 }));
  }

  private rangeStart(range: Range): Date | null {
    if (range === 'all') return null;
    const now = new Date();
    if (range === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = range === 'week' ? 7 : 30;
    return new Date(now.getTime() - days * 86_400_000);
  }

  private round(v: number | null): number | null {
    return v == null ? null : Math.round(v * 10) / 10;
  }
}
