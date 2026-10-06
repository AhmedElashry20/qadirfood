import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SettingsService } from '../settings/settings.module';
import {
  DEFAULT_ROAD_FACTOR,
  durationMinutes,
  roadKmFromAir,
  routeCacheKey,
} from './route-math';

export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface RouteResult {
  distanceKm: number;
  durationMinutes: number;
  /**
   * `road` = مسافة طريق حقيقية من مزوّد المسارات.
   * `estimate` = تقريب هوائي مضروب في معامل التفاف.
   *
   * بيوصل للعميل والكابتن عن قصد: تقدير مبني على خط مستقيم لازم يبان إنه
   * تقدير، مش يتعرض كأنه مسافة طريق مقيسة.
   */
  source: 'road' | 'estimate';
}

export abstract class RoutingProvider {
  abstract readonly name: string;
  abstract route(from: RoutePoint, to: RoutePoint): Promise<RouteResult>;
}

/**
 * التقريب الهوائي — السلوك الافتراضي لما مافيش مزوّد مسارات مظبّط.
 *
 * بيستخدم PostGIS (`ST_Distance` على `geography` = مسافة على سطح الأرض) مضروبة
 * في معامل التفاف. أدق من الخط المستقيم الخام، وبيفضل يعلن عن نفسه كتقدير.
 */
@Injectable()
export class StraightLineRouting extends RoutingProvider {
  readonly name = 'estimate';

  constructor(
    private readonly prisma: PrismaService,
    private readonly factor: number = DEFAULT_ROAD_FACTOR,
  ) {
    super();
  }

  async route(from: RoutePoint, to: RoutePoint): Promise<RouteResult> {
    const airKm = await this.prisma.distanceKm(from.lat, from.lng, to.lat, to.lng);
    const distanceKm = roadKmFromAir(airKm, this.factor);
    return { distanceKm, durationMinutes: durationMinutes(distanceKm), source: 'estimate' };
  }
}

/**
 * OSRM — مشروع مسارات مفتوح المصدر. السيرفر التجريبي العام
 * (`router.project-osrm.org`) **مش للإنتاج**: مافيش ضمان توفّر ولا حد معروف
 * للطلبات، فالإنتاج لازم نسخة مستضافة عندنا (`ROUTING_OSRM_URL`).
 *
 * أي فشل بيترمي، و`RoutingService` بترجع للتقدير الهوائي. المسار مش سبب كافي
 * إن طلب عميل يفشل.
 */
@Injectable()
export class OsrmRouting extends RoutingProvider {
  readonly name = 'osrm';
  private readonly logger = new Logger(OsrmRouting.name);

  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
  ) {
    super();
  }

  async route(from: RoutePoint, to: RoutePoint): Promise<RouteResult> {
    // ترتيب OSRM: lng,lat — معكوس عن المتعارف عليه، ومصدر أخطاء صامتة.
    const path = `${from.lng},${from.lat};${to.lng},${to.lat}`;
    const url = `${this.baseUrl.replace(/\/$/, '')}/route/v1/driving/${path}?overview=false&alternatives=false`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`OSRM رجّع ${res.status}`);

      const body = (await res.json()) as {
        code?: string;
        routes?: { distance?: number; duration?: number }[];
      };
      if (body.code !== 'Ok' || !body.routes?.length) {
        throw new Error(`OSRM: ${body.code ?? 'رد غير متوقع'}`);
      }

      const route = body.routes[0];
      const meters = route.distance;
      const seconds = route.duration;
      if (typeof meters !== 'number' || typeof seconds !== 'number') {
        throw new Error('OSRM: رد ناقص');
      }

      return {
        distanceKm: meters / 1000,
        durationMinutes: Math.ceil(seconds / 60),
        source: 'road',
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * المسافة والوقت بين نقطتين.
 *
 * كل المسافات في المنصة كانت خط مستقيم: رسوم التوصيل، مستحق الكابتن، والوقت
 * المتوقع للعميل. الفرق بين الهوائي والطريق في المدن ~٣٠٪، وكان كله في اتجاه
 * واحد — بخس في مستحق الكابتن ووقت متوقع أقصر من الواقع.
 *
 * ثلاث ضمانات:
 *   · **كاش** — نفس (فرع ← عنوان) بيتكرر كتير؛ بنكاش بإحداثيات مدوّرة لـ ٤
 *     خانات (~١١ متر) ليوم. من غير الكاش كل طلب = نداء شبكة.
 *   · **fail-soft** — أي فشل في المزوّد بيرجع للتقدير الهوائي. مزوّد المسارات
 *     مش سبب كافي إن طلب عميل يفشل.
 *   · **الشفافية** — الرد بيقول `road` ولا `estimate`، فالتطبيق يقدر يفرّق.
 */
@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);
  private readonly fallback: StraightLineRouting;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly settings: SettingsService,
  ) {
    this.fallback = new StraightLineRouting(prisma);
  }

  async route(from: RoutePoint, to: RoutePoint): Promise<RouteResult> {
    const key = routeCacheKey(from, to);

    const cached = await this.redis.cacheGet<RouteResult>(key).catch(() => null);
    if (cached) return cached;

    const result = await this.compute(from, to);

    // الكاش مش حرج: لو Redis وقع، المسار اتحسب صح خلاص.
    await this.redis.cacheSet(key, result, 86_400).catch(() => undefined);
    return result;
  }

  /** المسافة بالكيلومتر بس — للمسارات اللي مش محتاجة الوقت. */
  async distanceKm(from: RoutePoint, to: RoutePoint): Promise<number> {
    return (await this.route(from, to)).distanceKm;
  }

  private async compute(from: RoutePoint, to: RoutePoint): Promise<RouteResult> {
    const provider = await this.provider();
    if (!provider) return this.fallback.route(from, to);

    try {
      return await provider.route(from, to);
    } catch (error) {
      // تحذير مش خطأ: الرجوع للتقدير سلوك مقصود ومتوقع.
      this.logger.warn(
        `فشل مزوّد المسارات (${provider.name}) — رجوع للتقدير الهوائي: ${(error as Error).message}`,
      );
      return this.fallback.route(from, to);
    }
  }

  /** `null` = مافيش مزوّد مظبّط، استخدم التقدير. */
  private async provider(): Promise<RoutingProvider | null> {
    const name = (await this.settings.get('ROUTING_PROVIDER'))?.toLowerCase();
    if (name !== 'osrm') return null;

    const baseUrl = await this.settings.get('ROUTING_OSRM_URL');
    if (!baseUrl) {
      this.logger.warn('ROUTING_PROVIDER=osrm لكن ROUTING_OSRM_URL فارغ — رجوع للتقدير');
      return null;
    }

    const timeout = Number((await this.settings.get('ROUTING_TIMEOUT_MS')) ?? 2500);
    return new OsrmRouting(baseUrl, Number.isFinite(timeout) ? timeout : 2500);
  }
}
