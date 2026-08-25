import {
  Module,
  Injectable,
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { CaptainStatus, OrderStatus, RelayStatus, UserRole, ZoneType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, type AuthUser } from '../common';
import { ZonesService } from '../zones/zones.service';
import { ZonesModule } from '../zones/zones.module';

class ArriveDto {
  @IsOptional() @IsString() photoUrl?: string; // صورة التسليم عند نقطة الالتقاء
  @IsOptional() @IsNumber() lat?: number;
  @IsOptional() @IsNumber() lng?: number;
}
class ConfirmDto {
  @IsString() code!: string; // كود التسليم اللي بيظهر لمندوب المركبة
  @IsString() photoUrl!: string; // صورة تأكيد الاستلام من مندوب المشي
}

@Injectable()
export class RelayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly zones: ZonesService,
  ) {}

  /**
   * مندوب المركبة وصل نقطة الالتقاء على حدود الحرم — بنختار مندوب مشي متاح في
   * منطقة الحرم ونفتح عملية تسليم (بالصورة).
   */
  async arrive(user: AuthUser, orderId: string, dto: ArriveDto) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('الطلب غير موجود');
    if (order.captainId !== user.captainId) throw new ForbiddenException('الطلب ده مش مسند لك');
    if (!order.requiresRelay) throw new BadRequestException('الطلب ده مش محتاج تسليم بالتناوب');

    // منطقة الحرم الخاصة بوجهة الطلب.
    const dropPoint = await this.prisma.getPoint('addresses', 'location', order.addressId);
    const zone = dropPoint ? await this.zones.zoneForPoint(dropPoint.lat, dropPoint.lng) : null;
    if (!zone || zone.type !== ZoneType.HARAM) {
      throw new BadRequestException('وجهة الطلب مش داخل منطقة حرم');
    }

    // مندوب مشي متاح داخل منطقة الحرم دي.
    const foot = await this.prisma.captain.findFirst({
      where: {
        isFootCourier: true,
        assignedZoneId: zone.id,
        status: CaptainStatus.ONLINE,
        isVerified: true,
        id: { not: user.captainId },
      },
      include: { user: { select: { fullName: true, phone: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    if (!foot) throw new BadRequestException('لا يوجد مندوب مشي متاح في الحرم حالياً — حاول بعد قليل');

    // نقطة الالتقاء = **أقرب** نقطة من نقاط المنطقة لموقع مندوب المركبة (لو بعت
    // موقعه)، وإلا أول نقطة. توافقياً: نقطة المنطقة الرئيسية لو مافيش قائمة.
    const points = await this.prisma.handoffPoint.findMany({
      where: { zoneId: zone.id },
      orderBy: { sortOrder: 'asc' },
    });
    let chosen =
      points[0] ??
      (zone.handoffLat != null && zone.handoffLng != null
        ? { name: zone.handoffName ?? 'نقطة الالتقاء', lat: zone.handoffLat, lng: zone.handoffLng }
        : null);
    if (points.length && dto.lat != null && dto.lng != null) {
      const d2 = (p: { lat: number; lng: number }) =>
        (p.lat - dto.lat!) ** 2 + (p.lng - dto.lng!) ** 2;
      chosen = points.reduce((best, p) => (d2(p) < d2(best) ? p : best), points[0]);
    }

    const handoff = await this.prisma.relayHandoff.upsert({
      where: { orderId },
      create: {
        orderId,
        zoneId: zone.id,
        fromCaptainId: user.captainId!,
        toCaptainId: foot.id,
        status: RelayStatus.ARRIVED,
        photoUrl: dto.photoUrl ?? null,
        handoffLat: chosen?.lat ?? dto.lat ?? null,
        handoffLng: chosen?.lng ?? dto.lng ?? null,
      },
      update: {
        toCaptainId: foot.id,
        status: RelayStatus.ARRIVED,
        photoUrl: dto.photoUrl ?? undefined,
        handoffLat: chosen?.lat ?? dto.lat ?? undefined,
        handoffLng: chosen?.lng ?? dto.lng ?? undefined,
      },
    });

    return {
      handoff,
      footCourier: { id: foot.id, name: foot.user.fullName, phone: foot.user.phone },
      handoffPoint: { lat: handoff.handoffLat, lng: handoff.handoffLng, name: chosen?.name ?? null },
    };
  }

  /** مندوب المشي يؤكّد الاستلام بالصورة — بيبقى هو حامل الطلب داخل الحرم. */
  async confirm(user: AuthUser, orderId: string, dto: ConfirmDto) {
    const handoff = await this.prisma.relayHandoff.findUnique({ where: { orderId } });
    if (!handoff) throw new NotFoundException('لا توجد عملية تسليم لهذا الطلب');
    if (handoff.toCaptainId !== user.captainId) throw new ForbiddenException('التسليم ده مش ليك');
    if (handoff.status === RelayStatus.CONFIRMED) throw new BadRequestException('تم التأكيد بالفعل');
    // كود التسليم — مندوب المركبة بيقوله لمندوب المشي، اللي بيدخّله هنا. إثبات
    // إنهم اتقابلوا فعلاً عند نقطة الالتقاء.
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { handoffCode: true } });
    if (!order || order.handoffCode !== dto.code?.trim()) {
      throw new BadRequestException('كود التسليم غير صحيح');
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.relayHandoff.update({
        where: { orderId },
        data: { status: RelayStatus.CONFIRMED, photoUrl: dto.photoUrl, confirmedAt: new Date() },
      }),
      // مندوب المشي بقى الحامل الفعلي داخل الحرم.
      this.prisma.order.update({ where: { id: orderId }, data: { footCaptainId: user.captainId } }),
      // مندوب المركبة خلّص رجلته → يرجع متاح؛ ومندوب المشي بقى في مهمة.
      this.prisma.captain.updateMany({
        where: { id: handoff.fromCaptainId, status: CaptainStatus.ON_TRIP },
        data: { status: CaptainStatus.ONLINE },
      }),
      this.prisma.captain.update({
        where: { id: user.captainId! },
        data: { status: CaptainStatus.ON_TRIP },
      }),
    ]);
    return updated;
  }

  /** التسليمات المستنية تأكيدي كمندوب مشي. */
  async incoming(user: AuthUser) {
    const rows = await this.prisma.relayHandoff.findMany({
      where: { toCaptainId: user.captainId, status: RelayStatus.ARRIVED },
      orderBy: { createdAt: 'asc' },
    });
    const orders = await this.prisma.order.findMany({
      where: { id: { in: rows.map((r) => r.orderId) } },
      select: { id: true, orderNumber: true, address: { select: { district: true, city: true } } },
    });
    const byId = new Map(orders.map((o) => [o.id, o]));
    return rows.map((r) => ({
      orderId: r.orderId,
      orderNumber: byId.get(r.orderId)?.orderNumber,
      district: byId.get(r.orderId)?.address?.district ?? byId.get(r.orderId)?.address?.city,
      photoUrl: r.photoUrl,
      handoffPoint: { lat: r.handoffLat, lng: r.handoffLng },
      createdAt: r.createdAt,
    }));
  }

  async status(orderId: string) {
    const h = await this.prisma.relayHandoff.findUnique({ where: { orderId } });
    return h ?? { status: null };
  }

  /** كل طلبات التناوب النشطة — لشاشة مراقبة الحرم في اللوحة. */
  async adminList() {
    const orders = await this.prisma.order.findMany({
      where: {
        requiresRelay: true,
        status: { notIn: [OrderStatus.DELIVERED, OrderStatus.CANCELLED, OrderStatus.REJECTED] },
      },
      include: {
        branch: { select: { nameAr: true } },
        captain: { include: { user: { select: { fullName: true, phone: true } } } },
        footCaptain: { include: { user: { select: { fullName: true, phone: true } } } },
        relayHandoff: true,
      },
      orderBy: { placedAt: 'desc' },
    });

    // مرحلة الطلب: 1) مندوب المركبة في الطريق للحرم · 2) عند نقطة الالتقاء ·
    // 3) اتسلّم لمندوب المشي وجوّه الحرم.
    const leg = (o: (typeof orders)[number]): 'to_handoff' | 'at_handoff' | 'in_haram' => {
      if (o.relayHandoff?.status === RelayStatus.CONFIRMED) return 'in_haram';
      if (o.relayHandoff?.status === RelayStatus.ARRIVED) return 'at_handoff';
      return 'to_handoff';
    };

    return orders.map((o) => ({
      orderId: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      branch: o.branch?.nameAr ?? null,
      leg: leg(o),
      vehicleCaptain: o.captain
        ? { name: o.captain.user.fullName, phone: o.captain.user.phone }
        : null,
      footCaptain: o.footCaptain
        ? { name: o.footCaptain.user.fullName, phone: o.footCaptain.user.phone }
        : null,
      handoff: o.relayHandoff
        ? {
            status: o.relayHandoff.status,
            photoUrl: o.relayHandoff.photoUrl,
            confirmedAt: o.relayHandoff.confirmedAt,
            lat: o.relayHandoff.handoffLat,
            lng: o.relayHandoff.handoffLng,
          }
        : null,
      createdAt: o.placedAt,
    }));
  }
}

@ApiTags('relay')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('relay')
export class RelayController {
  constructor(private readonly relay: RelayService) {}

  @Post(':orderId/arrive')
  @Roles(UserRole.CAPTAIN)
  @ApiOperation({ summary: 'مندوب المركبة: وصلت نقطة الالتقاء (اختيار مندوب مشي)' })
  arrive(@CurrentUser() u: AuthUser, @Param('orderId') orderId: string, @Body() dto: ArriveDto) {
    return this.relay.arrive(u, orderId, dto);
  }

  @Post(':orderId/confirm')
  @Roles(UserRole.CAPTAIN)
  @ApiOperation({ summary: 'مندوب المشي: تأكيد الاستلام بالصورة' })
  confirm(@CurrentUser() u: AuthUser, @Param('orderId') orderId: string, @Body() dto: ConfirmDto) {
    return this.relay.confirm(u, orderId, dto);
  }

  @Get('incoming')
  @Roles(UserRole.CAPTAIN)
  @ApiOperation({ summary: 'مندوب المشي: التسليمات المستنية تأكيدي' })
  incoming(@CurrentUser() u: AuthUser) {
    return this.relay.incoming(u);
  }

  @Get('active')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'كل طلبات التوصيل بالتناوب النشطة (مراقبة الحرم)' })
  active() {
    return this.relay.adminList();
  }

  @Get(':orderId')
  @Roles(UserRole.CAPTAIN, UserRole.ADMIN, UserRole.CUSTOMER)
  @ApiOperation({ summary: 'حالة التسليم بالتناوب للطلب' })
  status(@Param('orderId') orderId: string) {
    return this.relay.status(orderId);
  }
}

@Module({
  imports: [ZonesModule],
  controllers: [RelayController],
  providers: [RelayService],
})
export class RelayModule {}
