import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { type Zone } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AssignCaptainZoneDto, CreateZoneDto, UpdateZoneDto, ZonePointDto } from './zones.dto';

@Injectable()
export class ZonesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const zones = await this.prisma.zone.findMany({
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
      include: { handoffPoints: { orderBy: { sortOrder: 'asc' } } },
    });
    const polys = await this.boundaryMap(zones.map((z) => z.id));
    return zones.map((z) => this.toView(z, polys.get(z.id)));
  }

  async create(dto: CreateZoneDto) {
    const bounds = this.resolveBounds(dto.polygon, dto);
    const zone = await this.prisma.zone.create({
      data: {
        name: dto.name.trim(),
        type: dto.type ?? 'STANDARD',
        city: dto.city?.trim() ?? null,
        ...bounds,
        handoffLat: dto.handoffLat ?? null,
        handoffLng: dto.handoffLng ?? null,
        handoffName: dto.handoffName?.trim() ?? null,
        deliveryFee: dto.deliveryFee.toFixed(2),
        minOrderTotal: (dto.minOrderTotal ?? 0).toFixed(2),
        priority: dto.priority ?? 0,
        color: dto.color ?? '#F5C518',
        isActive: dto.isActive ?? true,
      },
    });
    if (dto.polygon) await this.setBoundary(zone.id, dto.polygon);
    if (dto.handoffPoints) await this.setHandoffPoints(zone.id, dto.handoffPoints);
    return this.detail(zone.id);
  }

  async update(id: string, dto: UpdateZoneDto) {
    const existing = await this.prisma.zone.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('المنطقة غير موجودة');

    // لو اترسم polygon جديد نحسب bbox منه؛ وإلا ناخد حدود الـ dto أو القديمة.
    const bounds = dto.polygon
      ? this.bboxFromPolygon(dto.polygon)
      : this.resolveBounds(undefined, {
          minLat: dto.minLat ?? existing.minLat,
          maxLat: dto.maxLat ?? existing.maxLat,
          minLng: dto.minLng ?? existing.minLng,
          maxLng: dto.maxLng ?? existing.maxLng,
        });

    await this.prisma.zone.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.city !== undefined ? { city: dto.city?.trim() ?? null } : {}),
        ...bounds,
        ...(dto.handoffLat !== undefined ? { handoffLat: dto.handoffLat } : {}),
        ...(dto.handoffLng !== undefined ? { handoffLng: dto.handoffLng } : {}),
        ...(dto.handoffName !== undefined ? { handoffName: dto.handoffName?.trim() ?? null } : {}),
        ...(dto.deliveryFee !== undefined ? { deliveryFee: dto.deliveryFee.toFixed(2) } : {}),
        ...(dto.minOrderTotal !== undefined ? { minOrderTotal: dto.minOrderTotal.toFixed(2) } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    if (dto.polygon) await this.setBoundary(id, dto.polygon);
    if (dto.handoffPoints) await this.setHandoffPoints(id, dto.handoffPoints);
    return this.detail(id);
  }

  /** استبدال نقاط الالتقاء بالكامل (أبسط من المزامنة الجزئية وكافي للوحة). */
  private async setHandoffPoints(zoneId: string, points: { name?: string; lat: number; lng: number }[]) {
    await this.prisma.$transaction([
      this.prisma.handoffPoint.deleteMany({ where: { zoneId } }),
      this.prisma.handoffPoint.createMany({
        data: points.map((p, i) => ({
          zoneId,
          name: p.name?.trim() || `نقطة ${i + 1}`,
          lat: p.lat,
          lng: p.lng,
          sortOrder: i,
        })),
      }),
    ]);
  }

  async remove(id: string) {
    const existing = await this.prisma.zone.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('المنطقة غير موجودة');
    // فكّ إسناد أي كابتن قبل الحذف عشان الـ FK مايكسرش.
    await this.prisma.captain.updateMany({ where: { assignedZoneId: id }, data: { assignedZoneId: null } });
    await this.prisma.zone.delete({ where: { id } });
    return { deleted: true };
  }

  async detail(id: string) {
    const z = await this.prisma.zone.findUnique({
      where: { id },
      include: { handoffPoints: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!z) throw new NotFoundException('المنطقة غير موجودة');
    const polys = await this.boundaryMap([id]);
    return this.toView(z, polys.get(id));
  }

  /**
   * المنطقة اللي بتغطّي نقطة — بولي‑جون مرسوم (ST_Contains) لو موجود، وإلا الـ bbox.
   * الأعلى أولوية بيكسب عند التداخل. المصدر الوحيد لتسعير الطلب وتحديد الحرم.
   */
  async zoneForPoint(lat: number, lng: number): Promise<Zone | null> {
    const rows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM zones
       WHERE "isActive" = true
         AND (
           ("boundary" IS NOT NULL AND ST_Contains("boundary"::geometry, ST_SetSRID(ST_MakePoint($1, $2), 4326)))
           OR ("boundary" IS NULL AND $2 BETWEEN "minLat" AND "maxLat" AND $1 BETWEEN "minLng" AND "maxLng")
         )
       ORDER BY priority DESC, id ASC
       LIMIT 1`,
      lng,
      lat,
    );
    if (!rows.length) return null;
    return this.prisma.zone.findUnique({ where: { id: rows[0].id } });
  }

  async lookup(lat: number, lng: number) {
    const zone = await this.zoneForPoint(lat, lng);
    if (!zone) return null;
    const polys = await this.boundaryMap([zone.id]);
    return this.toView(zone, polys.get(zone.id));
  }

  // ── إسناد الكباتن للمناطق ──
  async assignCaptain(dto: AssignCaptainZoneDto) {
    const captain = await this.prisma.captain.findUnique({ where: { id: dto.captainId } });
    if (!captain) throw new NotFoundException('الكابتن غير موجود');
    if (dto.zoneId) {
      const zone = await this.prisma.zone.findUnique({ where: { id: dto.zoneId } });
      if (!zone) throw new NotFoundException('المنطقة غير موجودة');
    }
    await this.prisma.captain.update({
      where: { id: dto.captainId },
      data: {
        assignedZoneId: dto.zoneId ?? null,
        ...(dto.isFootCourier !== undefined ? { isFootCourier: dto.isFootCourier } : {}),
      },
    });
    return { ok: true };
  }

  /** كل الكباتن مع منطقة عملهم — للوحة الإسناد. */
  async captainAssignments() {
    const captains = await this.prisma.captain.findMany({
      include: {
        user: { select: { fullName: true, phone: true } },
        assignedZone: { select: { id: true, name: true, type: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return captains.map((c) => ({
      id: c.id,
      name: c.user.fullName,
      phone: c.user.phone,
      status: c.status,
      isFootCourier: c.isFootCourier,
      zone: c.assignedZone
        ? { id: c.assignedZone.id, name: c.assignedZone.name, type: c.assignedZone.type }
        : null,
    }));
  }

  // ── مساعدات ──
  private resolveBounds(
    polygon: ZonePointDto[] | undefined,
    b: { minLat?: number; maxLat?: number; minLng?: number; maxLng?: number },
  ) {
    if (polygon?.length) return this.bboxFromPolygon(polygon);
    if (b.minLat == null || b.maxLat == null || b.minLng == null || b.maxLng == null) {
      throw new BadRequestException('لازم ترسم المنطقة أو تدخّل حدودها (min/max)');
    }
    if (b.minLat >= b.maxLat || b.minLng >= b.maxLng) {
      throw new BadRequestException('حدود المنطقة غير صحيحة — لازم min أقل من max');
    }
    return { minLat: b.minLat, maxLat: b.maxLat, minLng: b.minLng, maxLng: b.maxLng };
  }

  private bboxFromPolygon(points: ZonePointDto[]) {
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    return {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
    };
  }

  /** يخزّن البولي‑جون كـ geography من GeoJSON (حلقة مقفولة). */
  private async setBoundary(id: string, points: ZonePointDto[]) {
    const ring = points.map((p) => [p.lng, p.lat]);
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
    const geojson = JSON.stringify({ type: 'Polygon', coordinates: [ring] });
    await this.prisma.$executeRawUnsafe(
      `UPDATE zones SET boundary = ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography WHERE id = $2`,
      geojson,
      id,
    );
  }

  /** يجيب رؤوس البولي‑جون لكل منطقة (للرسم على الخريطة في اللوحة). */
  private async boundaryMap(ids: string[]): Promise<Map<string, { lat: number; lng: number }[]>> {
    const map = new Map<string, { lat: number; lng: number }[]>();
    if (!ids.length) return map;
    const rows = await this.prisma.$queryRawUnsafe<{ id: string; geojson: string | null }[]>(
      `SELECT id, ST_AsGeoJSON(boundary::geometry) AS geojson FROM zones
       WHERE id = ANY($1::text[]) AND boundary IS NOT NULL`,
      ids,
    );
    for (const r of rows) {
      if (!r.geojson) continue;
      try {
        const gj = JSON.parse(r.geojson);
        const ring: number[][] = gj.coordinates?.[0] ?? [];
        const pts = ring.slice(0, -1).map(([lng, lat]) => ({ lat, lng }));
        map.set(r.id, pts);
      } catch {
        /* تجاهل */
      }
    }
    return map;
  }

  private toView(z: Zone & { handoffPoints?: { id: string; name: string; lat: number; lng: number }[] }, polygon?: { lat: number; lng: number }[]) {
    return {
      id: z.id,
      name: z.name,
      type: z.type,
      city: z.city,
      minLat: z.minLat,
      maxLat: z.maxLat,
      minLng: z.minLng,
      maxLng: z.maxLng,
      polygon: polygon ?? null,
      handoffLat: z.handoffLat,
      handoffLng: z.handoffLng,
      handoffName: z.handoffName,
      handoffPoints: (z.handoffPoints ?? []).map((p) => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng })),
      deliveryFee: Number(z.deliveryFee),
      minOrderTotal: Number(z.minOrderTotal),
      priority: z.priority,
      color: z.color,
      isActive: z.isActive,
    };
  }
}
