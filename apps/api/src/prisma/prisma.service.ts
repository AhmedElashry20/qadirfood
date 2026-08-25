import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * أعمدة PostGIS (geography) مش مدعومة في Prisma Client، فأي قراءة/كتابة ليها
   * بتمر من هنا بـ raw SQL. الإحداثيات في PostGIS بترتيب (lng, lat) — مش العكس.
   */
  async setPoint(table: string, column: string, id: string, lat: number, lng: number) {
    await this.$executeRawUnsafe(
      `UPDATE "${table}" SET "${column}" = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography WHERE id = $3`,
      lng,
      lat,
      id,
    );
  }

  async getPoint(table: string, column: string, id: string): Promise<{ lat: number; lng: number } | null> {
    const rows = await this.$queryRawUnsafe<{ lat: number; lng: number }[]>(
      `SELECT ST_Y("${column}"::geometry) AS lat, ST_X("${column}"::geometry) AS lng
       FROM "${table}" WHERE id = $1 AND "${column}" IS NOT NULL`,
      id,
    );
    return rows[0] ?? null;
  }

  /** المسافة بالكيلومتر بين نقطتين — للتحقق من نطاق التوصيل وحساب مستحق الكابتن. */
  async distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): Promise<number> {
    const rows = await this.$queryRawUnsafe<{ km: number }[]>(
      `SELECT ST_Distance(
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography
       ) / 1000.0 AS km`,
      aLng,
      aLat,
      bLng,
      bLat,
    );
    return Number(rows[0]?.km ?? 0);
  }
}
