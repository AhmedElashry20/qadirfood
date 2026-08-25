import { Injectable, Logger, forwardRef, Inject, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CaptainStatus,
  CompanyStatus,
  DocumentStatus,
  DocumentType,
  FaceCheckStatus,
  OrderStatus,
  TgaStatus,
  TripOfferStatus,
  type Prisma,
} from '@prisma/client';
import Decimal from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { ZonesService } from '../zones/zones.service';
import { payoutForDistance, MIN_CAPTAIN_PAYOUT } from './captain-payout';

/** المتوسط المفترض لسرعة الكابتن في المدينة — لتقدير وقت وصوله للمطعم. */
const AVG_CITY_SPEED_KMH = 25;

@Injectable()
export class DispatchService implements OnModuleInit {
  private readonly logger = new Logger(DispatchService.name);
  /** مؤقتات البحث المجدولة — عشان نقدر نلغيها لو الطلب اتلغى. */
  private readonly timers = new Map<string, NodeJS.Timeout>();
  /** الكباتن اللي رفضوا أو عدّت مهلتهم على كل طلب — مانرجعش نعرض عليهم تاني. */
  private readonly declined = new Map<string, Set<string>>();

  /**
   * بعد إعادة تشغيل السيرفر، مؤقتات التوزيع في الذاكرة بتضيع — فطلب كان **جاهز
   * بلا كابتن** بيفضل معلّق للأبد ومحدش بيدوّر له على كابتن. بنعيد جدولة التوزيع
   * لكل الطلبات دي عند الإقلاع عشان مايتعلّقش عميل بسبب restart.
   */
  async onModuleInit() {
    const orphaned = await this.prisma.order.findMany({
      where: { status: OrderStatus.READY, captainId: null },
      select: { id: true },
    });
    for (const o of orphaned) this.bgDispatch(o.id);
    if (orphaned.length) {
      this.logger.log(`أعيد توزيع ${orphaned.length} طلب جاهز بلا كابتن بعد إعادة التشغيل`);
    }
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    // دائرية: الجيتواي بيستدعي dispatch لما الكابتن يرد على العرض، وdispatch بيبعت العروض عبر الجيتواي
    @Inject(forwardRef(() => TrackingGateway))
    private readonly gateway: TrackingGateway,
    private readonly zones: ZonesService,
  ) {}

  /**
   * جدولة البحث عن كابتن.
   *
   * الفكرة: الكابتن المفروض يوصل المطعم والطلب لسه بيخلص — مش قبلها بكتير (يستنى ويزهق)
   * ولا بعدها (الأكل يبرد). فبنبدأ البحث قبل موعد الجاهزية بمقدار وقت وصول الكابتن
   * المتوقع + هامش أمان لمهلة القبول والرفض.
   *
   * وقت بدء البحث = وقت الجاهزية − (متوسط وصول الكابتن + هامش المهلة)
   */
  scheduleDispatch(orderId: string, prepMinutes: number) {
    const offerTimeout = Number(this.config.get('TRIP_OFFER_TIMEOUT_SECONDS') ?? 30);
    // هامش: مهلتين قبول (لو أول كابتن رفض) + ٥ دقايق متوسط وصول للمطعم
    const bufferMinutes = 5 + (offerTimeout * 2) / 60;
    const delayMinutes = Math.max(0, prepMinutes - bufferMinutes);

    this.logger.log(`جدولة البحث عن كابتن للطلب ${orderId} بعد ${delayMinutes.toFixed(1)} دقيقة`);

    const timer = setTimeout(() => {
      this.timers.delete(orderId);
      this.bgDispatch(orderId);
    }, delayMinutes * 60 * 1000);

    this.timers.set(orderId, timer);
  }

  cancelDispatch(orderId: string) {
    const timer = this.timers.get(orderId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(orderId);
    }
    this.declined.delete(orderId);
  }

  /**
   * تشغيل التوزيع في الخلفية مع مسك أي خطأ. من غير الـ catch ده، أي فشل في
   * `dispatchNow` (قاعدة بيانات وقعت لحظة، Redis اتقطع…) بيبقى Promise مرفوض
   * من غير معالجة — واللي في Node الحديث بيقتل السيرفر كله.
   */
  private bgDispatch(orderId: string) {
    void this.dispatchNow(orderId).catch((e) =>
      this.logger.error(`فشل توزيع الطلب ${orderId} في الخلفية: ${(e as Error).message}`),
    );
  }

  /**
   * يدوّر على أقرب كابتن متاح ويعرض عليه المهمة. لو رفض أو عدّت مهلته،
   * يروح للي بعده — لحد ما حد يقبل أو تخلص القائمة (ساعتها نعيد المحاولة بعد شوية).
   */
  async dispatchNow(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { branch: true, address: true },
    });

    if (!order) return;
    if (order.captainId) return; // اتسند خلاص
    if (
      order.status === OrderStatus.CANCELLED ||
      order.status === OrderStatus.REJECTED ||
      order.status === OrderStatus.DELIVERED
    ) {
      return;
    }

    const branchPoint = await this.prisma.getPoint('branches', 'location', order.branchId);
    if (!branchPoint) {
      this.logger.error(`الفرع ${order.branchId} ملوش موقع — مش هينفع نسند كابتن`);
      return;
    }

    const radiusKm = Number(this.config.get('CAPTAIN_SEARCH_RADIUS_KM') ?? 7);
    const nearby = await this.redisNearby(branchPoint.lat, branchPoint.lng, radiusKm);

    const declinedSet = this.declined.get(orderId) ?? new Set<string>();

    // منطقة وجهة الطلب — بتحكم إسناد الكباتن المخصّصين لمناطق. الكابتن المسند
    // لمنطقة بياخد طلبات منطقته بس؛ غير المسند (assignedZoneId=null) عام لأي طلب.
    const dropPoint = await this.prisma.getPoint('addresses', 'location', order.addressId);
    const orderZone = dropPoint ? await this.zones.zoneForPoint(dropPoint.lat, dropPoint.lng) : null;
    const orderZoneId = orderZone?.id ?? null;

    // فلترة: متاح فعلاً في الداتابيز + موثّق + مش رافض الطلب ده قبل كده.
    // `isVerified` وحدها مش كفاية — لو وثيقة إلزامية انتهى تاريخها والعلم لسه
    // متسّجل true (مثلاً الكابتن ما فتحش التطبيق من ساعتها)، لازم نستبعده هنا
    // كمان. اشتراط هيئة النقل: ممنوع التوزيع على كابتن وثائقه منتهية.
    const candidateIds = nearby.map((c) => c.captainId).filter((id) => !declinedSet.has(id));
    const available = await this.prisma.captain.findMany({
      where: {
        id: { in: candidateIds },
        status: CaptainStatus.ONLINE,
        isVerified: true,
        // مناديب المشي (داخل الحرم) مابياخدوش توزيع المركبات العادي — بيستلموا
        // عبر مسار التسليم بالتناوب (relay).
        isFootCourier: false,
        // قفل المنطقة + شركة موقوفة — الاتنين شروط OR فبنجمّعهم تحت AND عشان
        // مايكتبوش فوق بعض. الكابتن المسند لمنطقة بياخد طلبات منطقته بس.
        AND: [
          { OR: [{ companyId: null }, { company: { status: CompanyStatus.ACTIVE } }] },
          {
            OR: [
              { assignedZoneId: null },
              ...(orderZoneId ? [{ assignedZoneId: orderZoneId }] : []),
            ],
          },
        ],
        documents: {
          none: {
            type: { in: [DocumentType.IDENTITY, DocumentType.LICENSE, DocumentType.VEHICLE_REG, DocumentType.INSURANCE] },
            OR: [
              { status: { in: [DocumentStatus.EXPIRED, DocumentStatus.REJECTED, DocumentStatus.PENDING] } },
              { status: DocumentStatus.APPROVED, expiresAt: { lt: new Date() } },
            ],
          },
        },
        // اشتراط هيئة النقل: بطاقة توصيل موثّقة وسارية. متحكوم بـ `TGA_ENFORCE`
        // عشان ما يكسرش بيئة موجودة قبل ما البطاقات تتظبّط — والبطاقات المزروعة
        // للفريق الأونلاين موثّقة أصلاً فالتفعيل مايأثّرش عليهم.
        ...this.tgaFilter(),
        // اشتراط التحقق اليومي بالوجه — لازم فحص موثّق النهاردة. متحكوم بـ
        // `FACE_CHECK_ENFORCE`.
        ...this.faceFilter(),
      },
      include: { user: true },
    });

    // نحافظ على ترتيب الأقرب اللي جه من Redis
    const ordered = nearby
      .map((n) => ({ nearby: n, captain: available.find((c) => c.id === n.captainId) }))
      .filter((x): x is { nearby: (typeof nearby)[0]; captain: (typeof available)[0] } => !!x.captain);

    if (!ordered.length) {
      this.logger.warn(`مفيش كباتن متاحين للطلب ${order.orderNumber} — إعادة محاولة بعد ٦٠ ثانية`);
      const retry = setTimeout(() => this.bgDispatch(orderId), 60_000);
      this.timers.set(orderId, retry);
      return;
    }

    const dropoff = await this.prisma.getPoint('addresses', 'location', order.addressId);
    const next = ordered[0];
    const offerTimeout = Number(this.config.get('TRIP_OFFER_TIMEOUT_SECONDS') ?? 30);

    const distanceKm = dropoff
      ? await this.prisma.distanceKm(branchPoint.lat, branchPoint.lng, dropoff.lat, dropoff.lng)
      : 0;

    const payout = this.payoutFor(distanceKm);

    // سجل العرض — الأساس اللي نسبة القبول بتتحسب منه. upsert لأن نفس الكابتن
    // ممكن يتعرض عليه نفس الطلب تاني بعد إعادة محاولة.
    await this.prisma.tripOffer.upsert({
      where: { orderId_captainId: { orderId: order.id, captainId: next.captain.id } },
      create: {
        orderId: order.id,
        captainId: next.captain.id,
        payout: payout.toFixed(2),
        distanceKm: distanceKm.toFixed(2),
      },
      update: { status: TripOfferStatus.OFFERED, offeredAt: new Date(), respondedAt: null },
    });

    this.gateway.emitTripOffer(next.captain.id, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      branch: {
        id: order.branch.id,
        nameAr: order.branch.nameAr,
        location: branchPoint,
        address: order.branch.address,
      },
      dropoff: {
        location: dropoff ?? { lat: 0, lng: 0 },
        district: order.address.district ?? order.address.city,
      },
      distanceKm: Number(distanceKm.toFixed(1)),
      payout: payout.toNumber(),
      expiresInSeconds: offerTimeout,
    });

    // لو ما ردّش خلال المهلة، نعتبره رافض ونروح للي بعده
    const offeredCaptainId = next.captain.id;
    const timer = setTimeout(() => {
      void this.recordOfferOutcome(orderId, offeredCaptainId, TripOfferStatus.TIMEOUT).catch((e) =>
        this.logger.error(`فشل تسجيل نتيجة العرض للطلب ${orderId}: ${(e as Error).message}`),
      );
      this.markDeclined(orderId, offeredCaptainId);
      this.gateway.emitTripOfferExpired(offeredCaptainId, order.id);
      this.bgDispatch(orderId);
    }, offerTimeout * 1000);

    this.timers.set(orderId, timer);
  }

  /** رد الكابتن على العرض — بيتنادى من TrackingGateway. */
  async handleOfferResponse(captainId: string, orderId: string, accepted: boolean): Promise<boolean> {
    // نلغي مؤقت انتهاء المهلة الأول
    this.cancelDispatch(orderId);

    if (!accepted) {
      await this.recordOfferOutcome(orderId, captainId, TripOfferStatus.REJECTED);
      this.markDeclined(orderId, captainId);
      this.bgDispatch(orderId);
      return false;
    }

    await this.recordOfferOutcome(orderId, captainId, TripOfferStatus.ACCEPTED);

    const offerTimeout = Number(this.config.get('TRIP_OFFER_TIMEOUT_SECONDS') ?? 30);
    // قفل ذري — يمنع إن ردّين متزامنين ياخدوا نفس الطلب
    const locked = await this.redis.acquireOfferLock(orderId, captainId, offerTimeout + 10);
    if (!locked) return false;

    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    // لازم الطلب يكون لسه **قابل للإسناد**: موجود، بدون كابتن، وفي حالة حيّة
    // (اتقبل/بيتحضّر/جاهز). من غير الشرط ده، كابتن بيقبل عرض لطلب **اتلغى**
    // للتو بيتسند لطلب ميت ويفضل ON_TRIP للأبد.
    const assignable: OrderStatus[] = [
      OrderStatus.ACCEPTED,
      OrderStatus.PREPARING,
      OrderStatus.READY,
    ];
    if (!order || order.captainId || !assignable.includes(order.status)) {
      await this.redis.releaseOfferLock(orderId);
      return false;
    }

    await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: orderId },
        data: { captainId, assignedAt: new Date() },
      }),
      this.prisma.captain.update({
        where: { id: captainId },
        data: { status: CaptainStatus.ON_TRIP },
      }),
    ]);

    const full = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { captain: { include: { user: true } }, branch: true },
    });

    // بلّغ المطعم إن في كابتن جاي (شاشة ٤ — بيانات الكابتن المسند)
    this.gateway.emitCaptainAssigned(full!);

    // لو الطلب كان جاهز خلاص، الحالة تتنقل فوراً لـ "في انتظار الكابتن"
    if (order.status === OrderStatus.READY) {
      await this.prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CAPTAIN_ASSIGNED },
      });
      await this.prisma.orderEvent.create({
        data: { orderId, status: OrderStatus.CAPTAIN_ASSIGNED, actorId: captainId, actorRole: 'CAPTAIN' },
      });
      this.gateway.emitOrderReady(captainId, full!);
    }

    await this.redis.releaseOfferLock(orderId);
    return true;
  }

  /**
   * شرط هيئة النقل على التوزيع — بطاقة توصيل موثّقة وسارية. بيتفعّل بـ
   * `TGA_ENFORCE` (1/true). مطفي افتراضياً عشان بيئة موجودة قبل ما البطاقات
   * تتظبّط ماتقفش. لما يتفعّل، أي كابتن بطاقته مش VERIFIED أو منتهية بيتستبعد.
   */
  private tgaFilter(): Prisma.CaptainWhereInput {
    const enforce = String(this.config.get('TGA_ENFORCE') ?? '').toLowerCase();
    if (enforce !== '1' && enforce !== 'true') return {};
    return {
      tgaStatus: TgaStatus.VERIFIED,
      tgaCardExpiresAt: { gte: new Date() },
    };
  }

  /**
   * شرط التحقق اليومي بالوجه على التوزيع — لازم المندوب يكون عنده فحص وجه
   * موثّق النهاردة. متحكوم بـ `FACE_CHECK_ENFORCE` (مطفي افتراضياً).
   */
  private faceFilter(): Prisma.CaptainWhereInput {
    const enforce = String(this.config.get('FACE_CHECK_ENFORCE') ?? '').toLowerCase();
    if (enforce !== '1' && enforce !== 'true') return {};
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return {
      faceChecks: { some: { status: FaceCheckStatus.VERIFIED, createdAt: { gte: startOfToday } } },
    };
  }

  /** مستحق الكابتن — حد أدنى + مقابل كل كيلومتر. */
  private payoutFor(distanceKm: number): Decimal {
    return payoutForDistance(distanceKm); // منطق نقي مختبَر في captain-payout.ts
  }

  async calculatePayout(orderId: string): Promise<Decimal> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return new Decimal(MIN_CAPTAIN_PAYOUT);

    const branchPoint = await this.prisma.getPoint('branches', 'location', order.branchId);
    const dropoff = await this.prisma.getPoint('addresses', 'location', order.addressId);
    if (!branchPoint || !dropoff) return new Decimal(MIN_CAPTAIN_PAYOUT);

    const km = await this.prisma.distanceKm(branchPoint.lat, branchPoint.lng, dropoff.lat, dropoff.lng);
    return this.payoutFor(km);
  }

  /** تقدير وقت وصول الكابتن (بالدقايق) من مسافة بالكيلومتر. */
  etaMinutes(distanceKm: number): number {
    return Math.ceil((distanceKm / AVG_CITY_SPEED_KMH) * 60);
  }

  private markDeclined(orderId: string, captainId: string) {
    const set = this.declined.get(orderId) ?? new Set<string>();
    set.add(captainId);
    this.declined.set(orderId, set);
  }

  /**
   * بيحدّث نتيجة العرض في السجل. بيحدّث بس العروض اللي لسه OFFERED عشان
   * مايدوسش على رد سابق (لو الكابتن قبل وبعدين المؤقت اتأخر شوية). الفشل هنا
   * مايوقفش التوزيع — التوزيع أهم من سطر إحصاء.
   */
  private async recordOfferOutcome(orderId: string, captainId: string, status: TripOfferStatus): Promise<void> {
    try {
      await this.prisma.tripOffer.updateMany({
        where: { orderId, captainId, status: TripOfferStatus.OFFERED },
        data: { status, respondedAt: new Date() },
      });
    } catch (error) {
      this.logger.error(`فشل تسجيل نتيجة العرض (${orderId}/${captainId}): ${(error as Error).message}`);
    }
  }

  private async redisNearby(lat: number, lng: number, radiusKm: number) {
    return this.redis.findNearbyCaptains(lat, lng, radiusKm, 10);
  }
}
