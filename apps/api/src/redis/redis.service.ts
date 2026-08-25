import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const CAPTAINS_GEO_KEY = 'captains:geo';
const CAPTAIN_META_PREFIX = 'captain:meta:';
const OFFER_LOCK_PREFIX = 'order:offer_lock:';

export interface NearbyCaptain {
  captainId: string;
  distanceKm: number;
  lat: number;
  lng: number;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.client = new Redis(this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
    });
    this.client.on('error', (err) => this.logger.error(`Redis: ${err.message}`));
  }

  async onModuleDestroy() {
    await this.client?.quit();
  }

  get raw(): Redis {
    return this.client;
  }

  // ── مواقع الكباتن ──────────────────────────────────────────
  // الموقع بيتحدّث كل ٥ ثواني وهو في مهمة. الكتابة في Postgres كل مرة هتقتل الداتابيز،
  // فالمصدر الحي هنا في Redis، و Postgres بياخد آخر موقع بس (snapshot) للتقارير.

  async setCaptainLocation(captainId: string, lat: number, lng: number, meta?: Record<string, string>) {
    const pipeline = this.client.pipeline();
    pipeline.geoadd(CAPTAINS_GEO_KEY, lng, lat, captainId); // ملاحظة: (lng, lat) — ترتيب Redis
    pipeline.hset(`${CAPTAIN_META_PREFIX}${captainId}`, {
      lat: String(lat),
      lng: String(lng),
      at: new Date().toISOString(),
      ...(meta ?? {}),
    });
    // لو الكابتن سكت خالص، بياناته تنتهي بعد ٥ دقايق ومايتحسبش متاح
    pipeline.expire(`${CAPTAIN_META_PREFIX}${captainId}`, 300);
    await pipeline.exec();
  }

  async getCaptainLocation(captainId: string): Promise<{ lat: number; lng: number; at: string } | null> {
    const meta = await this.client.hgetall(`${CAPTAIN_META_PREFIX}${captainId}`);
    if (!meta?.lat) return null;
    return { lat: Number(meta.lat), lng: Number(meta.lng), at: meta.at };
  }

  async removeCaptainLocation(captainId: string) {
    await this.client.zrem(CAPTAINS_GEO_KEY, captainId);
    await this.client.del(`${CAPTAIN_META_PREFIX}${captainId}`);
  }

  /** أقرب الكباتن لنقطة، مرتّبين بالأقرب. الفلترة على الحالة (ONLINE) بتحصل في dispatch. */
  async findNearbyCaptains(lat: number, lng: number, radiusKm: number, limit = 10): Promise<NearbyCaptain[]> {
    const results = (await this.client.geosearch(
      CAPTAINS_GEO_KEY,
      'FROMLONLAT',
      lng,
      lat,
      'BYRADIUS',
      radiusKm,
      'km',
      'ASC',
      'COUNT',
      limit,
      'WITHCOORD',
      'WITHDIST',
    )) as unknown as [string, string, [string, string]][];

    return results.map(([captainId, dist, [clng, clat]]) => ({
      captainId,
      distanceKm: Number(dist),
      lat: Number(clat),
      lng: Number(clng),
    }));
  }

  // ── أقفال عروض المهام ──────────────────────────────────────
  /** يمنع إسناد نفس الطلب لأكتر من كابتن لو وصلت ردود متزامنة. */
  async acquireOfferLock(orderId: string, captainId: string, ttlSeconds: number): Promise<boolean> {
    const ok = await this.client.set(`${OFFER_LOCK_PREFIX}${orderId}`, captainId, 'EX', ttlSeconds, 'NX');
    return ok === 'OK';
  }

  async releaseOfferLock(orderId: string) {
    await this.client.del(`${OFFER_LOCK_PREFIX}${orderId}`);
  }

  // ── كاش عام ────────────────────────────────────────────────
  async cacheGet<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async cacheSet(key: string, value: unknown, ttlSeconds = 60) {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async cacheDel(pattern: string) {
    const keys = await this.client.keys(pattern);
    if (keys.length) await this.client.del(...keys);
  }
}
