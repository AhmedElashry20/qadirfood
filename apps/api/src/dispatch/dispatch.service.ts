import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
  type OnModuleInit,
} from '@nestjs/common';
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
  UserRole,
  type Prisma,
} from '@prisma/client';
import Decimal from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { ZonesService } from '../zones/zones.service';
import { SettingsService } from '../settings/settings.module';
import { RoutingService } from '../routing/routing.service';
import { payoutForDistance, MIN_CAPTAIN_PAYOUT } from './captain-payout';

/** المتوسط المفترض لسرعة الكابتن في المدينة — لتقدير وقت وصوله للمطعم. */
const AVG_CITY_SPEED_KMH = 25;

/**
 * إعدادات التوزيع اللي الأدمن يقدر يغيّرها من اللوحة.
 *
 * الكتالوج ده هو الحد — أي مفتاح برّاه مابيتكتبش، عشان `PATCH` واحد مايبقاش
 * باب لكتابة أي إعداد في النظام.
 */
const DISPATCH_CONFIG = [
  { key: 'CAPTAIN_SEARCH_RADIUS_KM', label: 'نصف قطر البحث عن كابتن (كم)', kind: 'number', fallback: 7 },
  { key: 'TRIP_OFFER_TIMEOUT_SECONDS', label: 'مهلة رد الكابتن على العرض (ثانية)', kind: 'number', fallback: 30 },
  { key: 'TGA_ENFORCE', label: 'إلزام بطاقة هيئة النقل', kind: 'flag', fallback: 0 },
  { key: 'FACE_CHECK_ENFORCE', label: 'إلزام التحقق اليومي بالوجه', kind: 'flag', fallback: 0 },
] as const;

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
    private readonly settings: SettingsService,
    private readonly routing: RoutingService,
  ) {}

  /**
   * إعداد رقمي فعّال — إعداد اللوحة الأول وإلا متغيّر البيئة وإلا الافتراضي.
   * لازم يمرّ على `SettingsService` مش `ConfigService` على طول، وإلا الأدمن
   * يغيّر نصف قطر البحث من اللوحة والتوزيع يفضل شغّال بالقيمة القديمة.
   */
  private async num(key: string, fallback: number): Promise<number> {
    const raw = await this.settings.get(key);
    const n = Number(raw);
    return Number.isFinite(n) && raw !== undefined && raw !== '' ? n : fallback;
  }

  /** علم تشغيل/إيقاف فعّال (1/true) — بنفس أسبقية `num`. */
  private async flag(key: string): Promise<boolean> {
    const v = String((await this.settings.get(key)) ?? '').toLowerCase();
    return v === '1' || v === 'true';
  }

  /**
   * جدولة البحث عن كابتن.
   *
   * الفكرة: الكابتن المفروض يوصل المطعم والطلب لسه بيخلص — مش قبلها بكتير (يستنى ويزهق)
   * ولا بعدها (الأكل يبرد). فبنبدأ البحث قبل موعد الجاهزية بمقدار وقت وصول الكابتن
   * المتوقع + هامش أمان لمهلة القبول والرفض.
   *
   * وقت بدء البحث = وقت الجاهزية − (متوسط وصول الكابتن + هامش المهلة)
   */
  async scheduleDispatch(orderId: string, prepMinutes: number) {
    const offerTimeout = await this.num('TRIP_OFFER_TIMEOUT_SECONDS', 30);
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
      this.logger.error(`الفرع ${order.branchId} ملوش موقع — لا يمكن إسناد كابتن`);
      return;
    }

    const radiusKm = await this.num('CAPTAIN_SEARCH_RADIUS_KM', 7);
    const nearby = await this.redisNearby(branchPoint.lat, branchPoint.lng, radiusKm);

    const declinedSet = this.declined.get(orderId) ?? new Set<string>();

    // منطقة وجهة الطلب — بتحكم إسناد الكباتن المخصّصين لمناطق. الكابتن المسند
    // لمنطقة بياخد طلبات منطقته بس؛ غير المسند (assignedZoneId=null) عام لأي طلب.
    const dropPoint = await this.prisma.getPoint('addresses', 'location', order.addressId);
    const orderZone = dropPoint ? await this.zones.zoneForPoint(dropPoint.lat, dropPoint.lng) : null;
    const orderZoneId = orderZone?.id ?? null;

    // فلترة: متاح فعلاً في الداتابيز + موثّق + مش رافض الطلب ده قبل كده.
    const candidateIds = nearby.map((c) => c.captainId).filter((id) => !declinedSet.has(id));
    const available = await this.prisma.captain.findMany({
      where: { id: { in: candidateIds }, ...(await this.eligibilityWhere(orderZoneId)) },
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
    const offerTimeout = await this.num('TRIP_OFFER_TIMEOUT_SECONDS', 30);

    // مسافة طريق لما يكون فيه مزوّد مسارات، وإلا تقدير هوائي × معامل التفاف.
    // الرقم ده بيحدّد مستحق الكابتن، فالخط المستقيم كان بيبخس كل رحلة.
    const distanceKm = dropoff
      ? await this.routing.distanceKm(branchPoint, dropoff)
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

    // `actorId` في أحداث الطلب = معرّف **المستخدم**، مش معرّف الكابتن. كان
    // بيتكتب `captainId` هنا، فالتايم لاين مايقدرش يحلّ اسم الفاعل.
    const captain = await this.prisma.captain.findUnique({
      where: { id: captainId },
      select: { userId: true },
    });
    return this.assignCaptain(orderId, captainId, UserRole.CAPTAIN, captain?.userId);
  }

  /**
   * إسناد الطلب لكابتن — **المسار الوحيد** للإسناد، سواء الكابتن قبل عرض أو
   * الأدمن أسند يدوي من اللوحة. أي مسار تاني بيفوت القفل الذري ويقدر يسند
   * نفس الطلب لكابتنين.
   *
   * بيرجّع `false` لو الطلب اتسند بالفعل أو مابقاش قابل للإسناد.
   */
  private async assignCaptain(
    orderId: string,
    captainId: string,
    actorRole: UserRole,
    actorId?: string,
  ): Promise<boolean> {
    const offerTimeout = await this.num('TRIP_OFFER_TIMEOUT_SECONDS', 30);
    // قفل ذري — يمنع إن ردّين متزامنين ياخدوا نفس الطلب
    const locked = await this.redis.acquireOfferLock(orderId, captainId, offerTimeout + 10);
    if (!locked) return false;

    try {
      const order = await this.prisma.order.findUnique({ where: { id: orderId } });
      // لازم الطلب يكون لسه **قابل للإسناد**: موجود، بدون كابتن، وفي حالة حيّة
      // (اتقبل/بيتحضّر/جاهز). من غير الشرط ده، كابتن بيقبل عرض لطلب **اتلغى**
      // للتو بيتسند لطلب ميت ويفضل ON_TRIP للأبد.
      const assignable: OrderStatus[] = [
        OrderStatus.ACCEPTED,
        OrderStatus.PREPARING,
        OrderStatus.READY,
      ];
      if (!order || order.captainId || !assignable.includes(order.status)) return false;

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
          data: { orderId, status: OrderStatus.CAPTAIN_ASSIGNED, actorId, actorRole },
        });
        this.gateway.emitOrderReady(captainId, full!);
      }

      return true;
    } finally {
      // كان بيتحرّر في ٣ مسارات منفصلة — أي `return` جديد جوه الدالة كان
      // هيسيب القفل متمسك لحد ما TTL يخلص. `finally` بتقفلها نهائي.
      await this.redis.releaseOfferLock(orderId);
    }
  }

  // ────────────────────────── واجهة الأدمن ──────────────────────────
  // `DispatchService` كان شغّال في السيرفر من غير أي واجهة تتحكم فيه: مافيش
  // طريقة تشوف طلب معلّق بلا كابتن، ولا تسند واحد يدوي، ولا تعرف مين رفض.
  // الدوال دي بتفتح الصندوق الأسود للوحة.

  /** حالات الطلب اللي لسه مستنية كابتن. */
  private static readonly AWAITING: OrderStatus[] = [
    OrderStatus.ACCEPTED,
    OrderStatus.PREPARING,
    OrderStatus.READY,
  ];

  /**
   * طابور التوزيع — كل طلب مقبول ومستني كابتن، ومعاه سبب الانتظار.
   *
   * `pendingTimer` بيفرّق بين «البحث متجدول ولسه ماجاش وقته» و«البحث دار
   * وماحدش قبل» — الاتنين شكلهم واحد في الداتابيز، والفرق بينهم هو الفرق بين
   * «طبيعي» و«محتاج تدخل».
   */
  async adminQueue() {
    const orders = await this.prisma.order.findMany({
      where: { captainId: null, status: { in: DispatchService.AWAITING } },
      include: {
        branch: { select: { id: true, nameAr: true } },
        address: { select: { district: true, city: true } },
        tripOffers: {
          orderBy: { offeredAt: 'desc' },
          include: { captain: { include: { user: { select: { fullName: true } } } } },
        },
      },
      orderBy: { acceptedAt: 'asc' },
    });

    const now = Date.now();
    return orders.map((o) => {
      const since = o.readyAt ?? o.acceptedAt ?? o.placedAt;
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        branch: o.branch,
        district: o.address.district ?? o.address.city,
        acceptedAt: o.acceptedAt,
        readyAt: o.readyAt,
        waitingSeconds: Math.max(0, Math.floor((now - since.getTime()) / 1000)),
        pendingTimer: this.timers.has(o.id),
        declinedCount: (this.declined.get(o.id) ?? new Set()).size,
        offers: o.tripOffers.map((t) => ({
          captainId: t.captainId,
          captainName: t.captain.user.fullName,
          status: t.status,
          offeredAt: t.offeredAt,
          respondedAt: t.respondedAt,
          payout: Number(t.payout),
        })),
      };
    });
  }

  /** سجل العروض على طلب — مين اتعرض عليه وإيه كان رده. */
  async offersFor(orderId: string) {
    const offers = await this.prisma.tripOffer.findMany({
      where: { orderId },
      orderBy: { offeredAt: 'asc' },
      include: { captain: { include: { user: { select: { fullName: true, phone: true } } } } },
    });
    return offers.map((t) => ({
      captainId: t.captainId,
      captainName: t.captain.user.fullName,
      captainPhone: t.captain.user.phone,
      status: t.status,
      offeredAt: t.offeredAt,
      respondedAt: t.respondedAt,
      payout: Number(t.payout),
      distanceKm: Number(t.distanceKm),
    }));
  }

  /**
   * الكباتن المؤهّلين لطلب — بنفس شروط التوزيع الآلي بالظبط، عشان الأدمن
   * مايختارش من قائمة فيها حد التوزيع نفسه كان هيستبعده.
   *
   * مش محدود بنصف قطر البحث: الأدمن بيسند يدوي وقت ما الآلي فشل، فتضييق
   * القائمة لنفس الدايرة اللي فشلت مافيهوش فايدة.
   */
  async eligibleCaptainsFor(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('الطلب غير موجود');

    const dropPoint = await this.prisma.getPoint('addresses', 'location', order.addressId);
    const zone = dropPoint ? await this.zones.zoneForPoint(dropPoint.lat, dropPoint.lng) : null;

    const captains = await this.prisma.captain.findMany({
      where: await this.eligibilityWhere(zone?.id ?? null),
      include: { user: { select: { fullName: true, phone: true } } },
    });

    const declinedSet = this.declined.get(orderId) ?? new Set<string>();
    return captains.map((c) => ({
      id: c.id,
      name: c.user.fullName,
      phone: c.user.phone,
      vehicleType: c.vehicleType,
      /** رفض الطلب ده (أو عدّت مهلته) — الأدمن يشوفها قبل ما يسنده تاني. */
      declinedThisOrder: declinedSet.has(c.id),
    }));
  }

  /**
   * إسناد يدوي من الأدمن — بيمرّ على نفس قفل `assignCaptain` ونفس شروط
   * الأهلية. بنلغي أي عرض معلّق الأول وبنبلّغ الكابتن اللي كان معروض عليه إن
   * العرض اتسحب، وإلا يفضل شايف عرض لطلب اتسند لغيره.
   */
  async adminAssign(orderId: string, captainId: string, adminUserId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('الطلب غير موجود');
    if (order.captainId) throw new ConflictException('الطلب مُسنَد لكابتن بالفعل');
    if (!DispatchService.AWAITING.includes(order.status)) {
      throw new ConflictException(`لا يمكن إسناد طلب في حالة ${order.status}`);
    }

    const dropPoint = await this.prisma.getPoint('addresses', 'location', order.addressId);
    const zone = dropPoint ? await this.zones.zoneForPoint(dropPoint.lat, dropPoint.lng) : null;
    const eligible = await this.prisma.captain.findFirst({
      where: { id: captainId, ...(await this.eligibilityWhere(zone?.id ?? null)) },
      select: { id: true },
    });
    if (!eligible) {
      throw new ConflictException(
        'الكابتن غير مؤهّل لهذا الطلب — راجع حالته ووثائقه ومنطقة عمله. اشتراطات الالتزام لا تُتجاوز.',
      );
    }

    // اسحب العروض المعلّقة قبل الإسناد
    this.cancelDispatch(orderId);
    const pending = await this.prisma.tripOffer.findMany({
      where: { orderId, status: TripOfferStatus.OFFERED },
      select: { captainId: true },
    });
    for (const o of pending) {
      if (o.captainId === captainId) continue;
      await this.recordOfferOutcome(orderId, o.captainId, TripOfferStatus.TIMEOUT);
      this.gateway.emitTripOfferExpired(o.captainId, orderId);
    }

    const ok = await this.assignCaptain(orderId, captainId, UserRole.ADMIN, adminUserId);
    if (!ok) throw new ConflictException('فشل الإسناد — أُسنِد الطلب لكابتن آخر في اللحظة نفسها');

    await this.prisma.orderEvent.create({
      data: {
        orderId,
        status: order.status,
        actorId: adminUserId,
        actorRole: UserRole.ADMIN,
        note: 'إسناد يدوي من لوحة التحكم',
      },
    });

    this.logger.log(`إسناد يدوي: الطلب ${order.orderNumber} للكابتن ${captainId} بواسطة ${adminUserId}`);
    return { assigned: true };
  }

  /**
   * إعادة تشغيل البحث فوراً — للطلب اللي التوزيع الآلي وقف عنده. بنصفّي قائمة
   * الرفض عشان الكباتن اللي عدّت مهلتهم يتعرض عليهم تاني (ممكن يكونوا بقوا
   * فاضيين)، وإلا إعادة المحاولة هتلف على نفس القائمة الفاضية.
   */
  async adminRedispatch(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('الطلب غير موجود');
    if (order.captainId) throw new ConflictException('الطلب مُسنَد لكابتن بالفعل');
    if (!DispatchService.AWAITING.includes(order.status)) {
      throw new ConflictException(`لا يمكن توزيع طلب في حالة ${order.status}`);
    }

    this.cancelDispatch(orderId);
    this.declined.delete(orderId);
    this.bgDispatch(orderId);
    return { dispatching: true };
  }

  /** إعدادات التوزيع الفعّالة + مصدر كل قيمة (لوحة / بيئة / افتراضي). */
  async dispatchConfig() {
    const out = [];
    for (const def of DISPATCH_CONFIG) {
      const row = await this.prisma.setting.findUnique({ where: { key: def.key } });
      const fromDb = row?.value != null && row.value !== '';
      const env = this.config.get<string>(def.key);
      out.push({
        key: def.key,
        label: def.label,
        kind: def.kind,
        value: fromDb ? row!.value : (env ?? String(def.fallback)),
        source: fromDb ? 'panel' : env != null && env !== '' ? 'env' : 'default',
        fallback: String(def.fallback),
      });
    }
    return out;
  }

  /** حفظ إعدادات التوزيع. قيمة فاضية = امسح الإعداد وارجع لمتغيّر البيئة. */
  async saveDispatchConfig(items: { key: string; value?: string }[]) {
    const allowed = new Map<string, (typeof DISPATCH_CONFIG)[number]>(
      DISPATCH_CONFIG.map((d) => [d.key, d]),
    );
    for (const it of items) {
      const def = allowed.get(it.key);
      if (!def) continue; // مفاتيح الكتالوج بس
      if (it.value == null || it.value === '') {
        await this.prisma.setting.deleteMany({ where: { key: it.key } });
        continue;
      }
      if (def.kind === 'number' && !Number.isFinite(Number(it.value))) {
        throw new BadRequestException(`${def.label}: لازم يكون رقم`);
      }
      await this.prisma.setting.upsert({
        where: { key: it.key },
        create: { key: it.key, value: it.value },
        update: { value: it.value },
      });
    }
    return this.dispatchConfig();
  }

  /**
   * شروط أهلية الكابتن لاستلام طلب — المرجع الوحيد للأهلية.
   *
   * `isVerified` وحدها مش كفاية: لو وثيقة إلزامية انتهى تاريخها والعلم لسه
   * متسّجل true (الكابتن ما فتحش التطبيق من ساعتها)، لازم نستبعده هنا كمان.
   * اشتراط هيئة النقل: ممنوع التوزيع على كابتن وثائقه منتهية.
   *
   * الإسناد اليدوي من اللوحة بيمرّ على نفس الشروط — الالتزام مش اختياري،
   * فمافيش تجاوز للأدمن.
   */
  private async eligibilityWhere(orderZoneId: string | null): Promise<Prisma.CaptainWhereInput> {
    return {
      status: CaptainStatus.ONLINE,
      isVerified: true,
      // كابتن موقوف (`user.isActive = false`) لازم يختفي من التوزيع فوراً.
      // من غير الشرط ده الإيقاف بيمنعه من الـ API بس ويفضل مؤهّل للعروض.
      user: { isActive: true },
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
      // عشان ما يكسرش بيئة موجودة قبل ما البطاقات تتظبّط.
      ...(await this.tgaFilter()),
      // اشتراط التحقق اليومي بالوجه — لازم فحص موثّق النهاردة. متحكوم بـ
      // `FACE_CHECK_ENFORCE`.
      ...(await this.faceFilter()),
    };
  }

  /**
   * شرط هيئة النقل على التوزيع — بطاقة توصيل موثّقة وسارية. بيتفعّل بـ
   * `TGA_ENFORCE` (1/true). مطفي افتراضياً عشان بيئة موجودة قبل ما البطاقات
   * تتظبّط ماتقفش. لما يتفعّل، أي كابتن بطاقته مش VERIFIED أو منتهية بيتستبعد.
   */
  private async tgaFilter(): Promise<Prisma.CaptainWhereInput> {
    if (!(await this.flag('TGA_ENFORCE'))) return {};
    return {
      tgaStatus: TgaStatus.VERIFIED,
      tgaCardExpiresAt: { gte: new Date() },
    };
  }

  /**
   * شرط التحقق اليومي بالوجه على التوزيع — لازم المندوب يكون عنده فحص وجه
   * موثّق النهاردة. متحكوم بـ `FACE_CHECK_ENFORCE` (مطفي افتراضياً).
   */
  private async faceFilter(): Promise<Prisma.CaptainWhereInput> {
    if (!(await this.flag('FACE_CHECK_ENFORCE'))) return {};
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

    const km = await this.routing.distanceKm(branchPoint, dropoff);
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
