import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ItemAvailability,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  RestaurantStatus,
  UserRole,
  type Review,
} from '@prisma/client';
import Decimal from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { DispatchService } from '../dispatch/dispatch.service';
import { CaptainsService } from '../captains/captains.service';
import { PaymentsService } from '../payments/payments.service';
import { ZonesService } from '../zones/zones.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateOrderDto,
  AcceptOrderDto,
  RejectOrderDto,
  CancelOrderDto,
  CreateReviewDto,
  ListOrdersDto,
} from './orders.dto';
import { canTransition } from './order-transitions';
import { RoutingService } from '../routing/routing.service';
import { isOnlineMethod } from '../payments/payments.service';
import { LoyaltyService } from '../customer/loyalty.service';
import { cappedDiscount } from '../customer/loyalty-math';
import {
  releaseAt,
  scheduleRejectionMessage,
  validateScheduleTime,
} from './scheduling';
import { computeOrderTotals } from './order-pricing';
import type { AuthUser } from '../common';

/**
 * الـ include الثابت لكل استعلامات الطلب — أي لوحة أو تطبيق بيعتمد على الشكل ده،
 * فممنوع نشيل منه حاجة.
 */
const ORDER_INCLUDE = {
  items: { include: { options: true } },
  customer: { include: { user: true } },
  branch: true,
  address: true,
  captain: { include: { user: true } },
} satisfies Prisma.OrderInclude;

type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

/** إحداثيات مقروءة من أعمدة PostGIS (غير مرئية لـ Prisma). */
interface GeoPoint {
  lat: number;
  lng: number;
}

@Injectable()
export class OrdersService implements OnModuleInit {
  private readonly logger = new Logger(OrdersService.name);
  /** مؤقتات إطلاق الطلبات المجدولة — في الذاكرة، بتتعاد عند الإقلاع. */
  private readonly releaseTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly gateway: TrackingGateway,
    private readonly dispatch: DispatchService,
    private readonly captains: CaptainsService,
    private readonly payments: PaymentsService,
    private readonly zones: ZonesService,
    private readonly routing: RoutingService,
    private readonly loyalty: LoyaltyService,
    private readonly notifications: NotificationsService,
  ) {}

  // ────────────────────────────────────────────────────────────
  // آلة الحالات — البوابة الوحيدة لأي تغيير في حالة الطلب
  // ────────────────────────────────────────────────────────────

  private assertTransition(from: OrderStatus, to: OrderStatus) {
    if (!canTransition(from, to)) {
      throw new BadRequestException(`انتقال غير مسموح: ${from} → ${to}`);
    }
  }

  /** أي تغيير حالة بيمرّ من هنا: تحقق + طابع زمني + سجل حدث + بث سوكيت — في معاملة واحدة. */
  private async transition(
    orderId: string,
    to: OrderStatus,
    actor: { id?: string; role?: UserRole },
    extra: Prisma.OrderUpdateManyMutationInput = {},
    note?: string,
  ) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('الطلب غير موجود');

    this.assertTransition(order.status, to);

    const timestampField: Partial<Record<OrderStatus, keyof Prisma.OrderUpdateInput>> = {
      [OrderStatus.ACCEPTED]: 'acceptedAt',
      [OrderStatus.READY]: 'readyAt',
      [OrderStatus.CAPTAIN_ASSIGNED]: 'assignedAt',
      [OrderStatus.PICKED_UP]: 'pickedUpAt',
      [OrderStatus.DELIVERED]: 'deliveredAt',
      [OrderStatus.CANCELLED]: 'cancelledAt',
      [OrderStatus.REJECTED]: 'cancelledAt',
    };

    const stamp = timestampField[to];
    const from = order.status;
    const updated = await this.prisma.$transaction(async (tx) => {
      // تحديث **مشروط بالحالة الحالية**. لو request تاني اتسابق على نفس الطلب
      // ونقله بره `from` بين القراءة والكتابة، الشرط ده بيخلّي count=0 فبنرفض
      // بدل ما ننفّذ الانتقال مرتين (كان ده بيدفع الكابتن/يسترد الفلوس مرتين).
      const res = await tx.order.updateMany({
        where: { id: orderId, status: from },
        data: {
          status: to,
          ...(stamp ? { [stamp]: new Date() } : {}),
          ...extra,
        },
      });

      if (res.count === 0) {
        throw new ConflictException('حالة الطلب اتغيّرت للتو — حدّث وحاول من جديد');
      }

      await tx.orderEvent.create({
        data: { orderId, status: to, actorId: actor.id, actorRole: actor.role, note },
      });

      const result = await tx.order.findUnique({
        where: { id: orderId },
        include: this.orderInclude(),
      });
      return result!;
    });

    this.gateway.emitOrderStatusChanged(updated);
    this.notifyCustomer(updated, to);
    return updated;
  }

  /** إشعار Push للعميل عند تغيّر حالة طلبه — الرسائل بالعربي حسب الحالة. */
  private notifyCustomer(order: OrderWithRelations, to: OrderStatus) {
    const messages: Partial<Record<OrderStatus, string>> = {
      [OrderStatus.ACCEPTED]: 'المطعم قبل طلبك وبدأ التحضير 🍳',
      [OrderStatus.READY]: 'طلبك جاهز وبندوّر على كابتن 🛵',
      [OrderStatus.CAPTAIN_ASSIGNED]: 'كابتن استلم طلبك وفي الطريق للمطعم',
      [OrderStatus.PICKED_UP]: 'الكابتن استلم طلبك من المطعم 📦',
      [OrderStatus.ON_THE_WAY]: 'طلبك في الطريق إليك 🚀',
      [OrderStatus.DELIVERED]: 'تم توصيل طلبك — بالهناء والشفاء 🎉',
      [OrderStatus.REJECTED]: 'اعتذر المطعم عن طلبك — تم إرجاع أي مبلغ مدفوع',
      [OrderStatus.CANCELLED]: 'تم إلغاء طلبك',
    };
    const body = messages[to];
    if (!body) return;

    const userId = order.customer?.userId;
    if (!userId) return;
    void this.notifications
      .sendToUser(userId, {
        title: `طلب ${order.orderNumber}`,
        body,
        data: { orderId: order.id, status: to, type: 'order_status' },
      })
      .catch((e) => this.logger.error(`فشل إشعار الطلب ${order.id}: ${(e as Error).message}`));
  }

  private orderInclude() {
    return ORDER_INCLUDE;
  }

  // ────────────────────────────────────────────────────────────
  // الإحداثيات والتسلسل — الرد اللي التطبيق بيقراه
  // ────────────────────────────────────────────────────────────

  /**
   * أعمدة PostGIS مش موجودة في نتيجة Prisma خالص، فبنجيبها بـ raw query.
   * استعلام واحد لكل الـ ids — مش استعلام لكل طلب (N+1) في شاشة السجل.
   */
  private async pointsByIds(table: 'addresses' | 'branches', ids: string[]): Promise<Map<string, GeoPoint>> {
    const unique = [...new Set(ids)];
    if (!unique.length) return new Map();

    const rows = await this.prisma.$queryRawUnsafe<{ id: string; lat: number; lng: number }[]>(
      `SELECT id, ST_Y("location"::geometry) AS lat, ST_X("location"::geometry) AS lng
       FROM "${table}" WHERE id = ANY($1::text[]) AND "location" IS NOT NULL`,
      unique,
    );

    return new Map(rows.map((r) => [r.id, { lat: Number(r.lat), lng: Number(r.lng) }]));
  }

  /**
   * Prisma بيرجّع Decimal كـ object (بيتسلسل كـ string في الـ JSON) — تطبيقات Flutter
   * بتتوقع أرقام. بنحوّل كل المبالغ لأرقام JS، وبنلزق lat/lng على العنوان والفرع
   * عشان خريطة التتبع تقدر ترسم. باقي الحقول بتفضل زي ما هي.
   */
  private mapOrder(
    order: OrderWithRelations,
    geo: { address?: GeoPoint | null; branch?: GeoPoint | null } = {},
    checkoutUrl: string | null = null,
    viewer?: { role?: UserRole; captainId?: string; customerId?: string },
  ) {
    // أكواد التسليم بتبان بس للطرف اللي **بيعرض** الكود، ومتخفية عن اللي **بيدخّله**:
    //   • deliveryCode: العميل بيعرضه للمندوب → يبان للعميل (والأدمن) بس.
    //   • handoffCode: مندوب المركبة بيقوله لمندوب المشي → يبان لمندوب المركبة (والأدمن) بس.
    const isAdmin = viewer?.role === UserRole.ADMIN;
    const isOrderCustomer = !!viewer?.customerId && viewer.customerId === order.customerId;
    const isVehicleCaptain = !!viewer?.captainId && viewer.captainId === order.captainId;
    return {
      ...order,
      deliveryCode: isAdmin || isOrderCustomer ? order.deliveryCode : null,
      handoffCode: isAdmin || isVehicleCaptain ? order.handoffCode : null,
      // رابط الدفع الإلكتروني (لو الطلب بطاقة ومحتاج يفتح صفحة الدفع). `null`
      // للكاش أو لو التحصيل خلص فوراً.
      checkoutUrl,
      /**
       * مجدول ولسه ماوصلش المطعم. من غير الحقل ده التطبيق بيعرض «بانتظار قبول
       * المطعم» لطلب مجدول لبكرة — العميل يفتكر إن فيه مشكلة ويتصل بالدعم.
       */
      awaitingRelease: !!order.scheduledFor && !order.releasedAt,
      subtotal: Number(order.subtotal),
      deliveryFee: Number(order.deliveryFee),
      discount: Number(order.discount),
      vat: Number(order.vat),
      total: Number(order.total),
      commission: Number(order.commission),
      captainPayout: Number(order.captainPayout),
      items: order.items.map((item) => ({
        ...item,
        unitPrice: Number(item.unitPrice),
        lineTotal: Number(item.lineTotal),
        options: item.options.map((option) => ({
          ...option,
          extraPrice: Number(option.extraPrice),
        })),
      })),
      customer: {
        ...order.customer,
        walletBalance: Number(order.customer.walletBalance),
      },
      branch: {
        ...order.branch,
        deliveryRadiusKm: Number(order.branch.deliveryRadiusKm),
        deliveryFee: Number(order.branch.deliveryFee),
        minOrderTotal: Number(order.branch.minOrderTotal),
        rating: Number(order.branch.rating),
        lat: geo.branch?.lat ?? null,
        lng: geo.branch?.lng ?? null,
      },
      address: {
        ...order.address,
        lat: geo.address?.lat ?? null,
        lng: geo.address?.lng ?? null,
      },
      captain: order.captain
        ? {
            ...order.captain,
            rating: Number(order.captain.rating),
            walletBalance: Number(order.captain.walletBalance),
          }
        : null,
    };
  }

  // ────────────────────────────────────────────────────────────
  // إنشاء الطلب (العميل)
  // ────────────────────────────────────────────────────────────

  /**
   * الأسعار بتتحسب من الداتابيز، مش من العميل — أي سعر جاي في الـ request بيتجاهل تماماً.
   * والأسماء والأسعار بتتخزّن snapshot في order_items عشان تعديل المنيو بعدين
   * ما يفسدش الطلبات القديمة ولا التقارير.
   */
  async createOrder(customerId: string, dto: CreateOrderDto) {
    const branch = await this.prisma.branch.findUnique({ where: { id: dto.branchId } });
    if (!branch || !branch.isActive) throw new NotFoundException('الفرع غير موجود');
    if (branch.status !== RestaurantStatus.OPEN && branch.status !== RestaurantStatus.BUSY) {
      throw new BadRequestException('المطعم مغلق حالياً');
    }

    const address = await this.prisma.address.findFirst({ where: { id: dto.addressId, customerId } });
    if (!address) throw new NotFoundException('العنوان غير موجود');

    // تحقق إن العنوان جوه نطاق توصيل الفرع.
    //
    // **بيفضل مسافة هوائية عن قصد** — مايتحوّلش لمسافة طريق (`RoutingService`).
    // `deliveryRadiusKm` نصف قطر دايرة، ومسافة الطريق أطول من الهوائية ~٣٠٪،
    // فاستخدامها هنا بيقلّص تغطية كل فرع بنفس النسبة في صمت. مسافة الطريق
    // مكانها في حساب المستحق (`DispatchService`) مش في فحص التغطية.
    const branchPoint = await this.prisma.getPoint('branches', 'location', branch.id);
    const addressPoint = await this.prisma.getPoint('addresses', 'location', address.id);
    if (branchPoint && addressPoint) {
      const km = await this.prisma.distanceKm(
        branchPoint.lat,
        branchPoint.lng,
        addressPoint.lat,
        addressPoint.lng,
      );
      if (km > Number(branch.deliveryRadiusKm)) {
        throw new BadRequestException('العنوان خارج نطاق التوصيل لهذا الفرع');
      }
    }

    const menuItems = await this.prisma.menuItem.findMany({
      where: { id: { in: dto.items.map((i) => i.menuItemId) } },
      include: { optionGroups: { include: { options: true } } },
    });

    let subtotal = new Decimal(0);
    const itemsData: Prisma.OrderItemCreateWithoutOrderInput[] = [];

    for (const line of dto.items) {
      const item = menuItems.find((m) => m.id === line.menuItemId);
      if (!item) throw new BadRequestException(`صنف غير موجود: ${line.menuItemId}`);
      if (item.availability !== 'AVAILABLE') {
        throw new BadRequestException(`الصنف "${item.nameAr}" غير متاح حالياً`);
      }

      const allOptions = item.optionGroups.flatMap((g) =>
        g.options.map((o) => ({ ...o, groupNameAr: g.nameAr, group: g })),
      );
      const chosen = allOptions.filter((o) => line.optionIds.includes(o.id));

      // تحقق من قواعد كل مجموعة خيارات (إجباري / حد أدنى / حد أقصى)
      for (const group of item.optionGroups) {
        const count = chosen.filter((o) => o.optionGroupId === group.id).length;
        if (group.isRequired && count < Math.max(1, group.minSelect)) {
          throw new BadRequestException(`اختيار "${group.nameAr}" إلزامي في صنف "${item.nameAr}"`);
        }
        if (count > group.maxSelect) {
          throw new BadRequestException(`تجاوزت الحد الأقصى لاختيارات "${group.nameAr}"`);
        }
      }
      if (chosen.some((o) => !o.isAvailable)) {
        throw new BadRequestException('أحد الخيارات المختارة غير متاح');
      }

      const extras = chosen.reduce((sum, o) => sum.plus(new Decimal(o.extraPrice.toString())), new Decimal(0));
      const unitPrice = new Decimal(item.price.toString()).plus(extras);
      const lineTotal = unitPrice.times(line.quantity);
      subtotal = subtotal.plus(lineTotal);

      itemsData.push({
        menuItem: { connect: { id: item.id } },
        nameAr: item.nameAr,
        nameEn: item.nameEn,
        unitPrice: unitPrice.toFixed(2),
        quantity: line.quantity,
        notes: line.notes,
        lineTotal: lineTotal.toFixed(2),
        options: {
          create: chosen.map((o) => ({
            groupNameAr: o.groupNameAr,
            nameAr: o.nameAr,
            nameEn: o.nameEn,
            extraPrice: o.extraPrice.toString(),
          })),
        },
      });
    }

    // الكوبون
    let discount = new Decimal(0);
    let couponId: string | undefined;
    // الحد الأدنى للطلب — الفرع بيعلنه في التطبيق، فلازم يتفرض هنا كمان.
    const minOrder = new Decimal(branch.minOrderTotal?.toString() ?? 0);
    if (subtotal.lessThan(minOrder)) {
      throw new BadRequestException(`الحد الأدنى للطلب من الفرع ده ${minOrder.toFixed(0)} ر.س`);
    }

    if (dto.couponCode) {
      const coupon = await this.prisma.coupon.findUnique({ where: { code: dto.couponCode } });
      const now = new Date();
      const valid =
        coupon &&
        coupon.isActive &&
        (!coupon.startsAt || coupon.startsAt <= now) &&
        (!coupon.expiresAt || coupon.expiresAt >= now) &&
        (!coupon.usageLimit || coupon.usedCount < coupon.usageLimit) &&
        subtotal.gte(new Decimal(coupon.minOrderTotal.toString()));

      if (!valid) throw new BadRequestException('الكوبون غير صالح أو منتهي الصلاحية');

      discount = coupon!.percentOff
        ? subtotal.times(coupon!.percentOff).dividedBy(100)
        : new Decimal(coupon!.amountOff?.toString() ?? 0);

      if (coupon!.maxDiscount) {
        discount = Decimal.min(discount, new Decimal(coupon!.maxDiscount.toString()));
      }
      couponId = coupon!.id;
    }

    // ── استبدال نقاط الولاء ──
    // قيمة النقاط بتتحوّل لريال وبتنضاف على خصم الكوبون، فبتمشي في **نفس**
    // مسار الخصم المختبَر: الضريبة والعمولة بيتحسبوا صح من غير فرع خاص.
    //
    // السقف = المجموع ناقص خصم الكوبون: من غيره كوبون كبير + نقاط كتير بيخلّوا
    // الوعاء الخاضع للضريبة سالب، فالضريبة تطلع سالبة والإجمالي يقلب لصالح العميل.
    let pointsRedeemed = 0;
    if (dto.redeemPoints && dto.redeemPoints > 0) {
      const headroom = cappedDiscount(subtotal, subtotal.minus(discount));
      const quote = await this.loyalty.quoteRedemption(customerId, dto.redeemPoints, headroom);
      if (quote.points <= 0) {
        throw new BadRequestException('النقاط غير كافية أو أقل من الحد الأدنى للاستبدال');
      }
      pointsRedeemed = quote.points;
      discount = discount.plus(quote.discountSar);
    }

    // سقف أخير على الخصم الكلي — حارس يشمل الكوبون لوحده كمان: كوبون بمبلغ
    // ثابت أكبر من السلة كان بيقدر يخلّي الخصم أكبر من المجموع.
    discount = cappedDiscount(subtotal, discount);

    // رسوم التوصيل: منطقة عنوان العميل بتغلب — لو النقطة جوّه منطقة مفعّلة،
    // رسومها هي المصدر؛ وإلا رسوم الفرع؛ وإلا الافتراضي من الـ env.
    const zone = addressPoint ? await this.zones.zoneForPoint(addressPoint.lat, addressPoint.lng) : null;
    const deliveryFee = new Decimal(
      zone?.deliveryFee?.toString() ??
        branch.deliveryFee?.toString() ??
        this.config.get<string>('DEFAULT_DELIVERY_FEE') ??
        10,
    );
    const vatPercent = new Decimal(this.config.get<string>('VAT_PERCENT') ?? 15);
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: branch.restaurantId } });

    // الحسبة المالية كلها في دالة نقية مختبَرة (`order-pricing.ts`).
    const { vat, total, commission } = computeOrderTotals({
      subtotal,
      discount,
      deliveryFee,
      vatPercent,
      commissionRate: restaurant!.commissionRate.toString(),
    });

    // ── الإكرامية ──
    // للدفع الإلكتروني بس: إكرامية على طلب كاش مالهاش مسار تحصيل — العميل
    // بيسلّمها في اليد للمندوب، والمنصة مالهاش دور. لو قبلناها كنا هنقيّد
    // للمندوب فلوس ماحصّلناهاش.
    const tipAmount = new Decimal(dto.tipAmount ?? 0);
    if (tipAmount.greaterThan(0) && !isOnlineMethod(dto.paymentMethod)) {
      throw new BadRequestException('الإكرامية متاحة للدفع الإلكتروني فقط — أما الدفع نقداً فيُسلَّم للمندوب مباشرة');
    }

    // ── الجدولة ──
    // وقت التسليم اللي العميل طلبه بيتحقّق من قواعد نقية (`scheduling.ts`)،
    // وبعدين بنحسب وقت إطلاق الطلب للمطعم: التسليم − (تحضير الفرع + التوصيل).
    // مسافة الطريق بتيجي من `RoutingService` عشان التقدير يبقى على الطريق
    // الفعلي — التقدير الهوائي كان بيقصّر وقت التوصيل فالطلب يتطلق متأخر.
    let scheduledFor: Date | null = null;
    let planRelease: Date | null = null;
    if (dto.scheduledFor) {
      const now = new Date();
      scheduledFor = new Date(dto.scheduledFor);
      const rejection = validateScheduleTime(scheduledFor, now);
      if (rejection) throw new BadRequestException(scheduleRejectionMessage(rejection));

      const travelMinutes =
        branchPoint && addressPoint
          ? (await this.routing.route(branchPoint, addressPoint)).durationMinutes
          : 0;
      planRelease = releaseAt(scheduledFor, branch.avgPrepMinutes, travelMinutes, now);
    }

    // إعادة محاولة عند تصادم رقم الطلب: generateOrderNumber بيعتمد على count()
    // اللي بيتسابق تحت التزامن، فعميلين في نفس اللحظة ممكن ياخدوا نفس الرقم.
    // بدل ما طلب العميل يفشل، بنمسك تصادم القيد الفريد ونعيد برقم مختلف.
    let orderNumberAttempt = 0;
    let order: Awaited<ReturnType<typeof this.createOrderTx>>;
    for (;;) {
      try {
        order = await this.createOrderTx(orderNumberAttempt, {
          customerId, branch, address, couponId, dto, itemsData,
          subtotal, deliveryFee, discount, vat, total, commission,
          scheduledFor, releaseAt: planRelease, tipAmount, pointsRedeemed,
          // الوجهة داخل منطقة حرم ⇒ الطلب محتاج تسليم بالتناوب (مندوب لمندوب).
          requiresRelay: zone?.type === 'HARAM',
        });
        break;
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002' &&
          orderNumberAttempt < 4
        ) {
          orderNumberAttempt++;
          this.logger.warn(`تصادم رقم طلب — إعادة محاولة ${orderNumberAttempt}`);
          continue;
        }
        throw e;
      }
    }

    // طلب مجدول مايوصلش المطعم دلوقتي: بيفضل PENDING ومخفي لحد وقت الإطلاق
    // (وقت التسليم − تحضير − توصيل). إشعار المطعم ومؤقت «مالوش رد» الاتنين
    // بيتأجّلوا معاه، وإلا المطعم بياخد تنبيه لطلب ملوش داعي يشتغل عليه دلوقتي
    // وبعد ٣ دقايق يتسجّل إنه «مردّش».
    if (order.scheduledFor) {
      this.scheduleRelease(order.id, order.releaseAt ?? new Date());
    } else {
      // إشعار الفرع لحظياً — ده اللي بيشغّل صوت التنبيه في تطبيق المطعم
      this.gateway.emitNewOrder(order);
      this.scheduleUnansweredAlert(order.id);
    }

    // التحصيل بعد الـ commit مش جواه: نداء شبكة لبوابة خارجية جوه transaction
    // بيقفل صف الطلب طول ما البوابة بتفكّر. وفشله مالهوش يسقّط طلب اتعمل خلاص.
    const charge = await this.payments.openCharge(order.id);
    order.paymentStatus = charge.status;

    // نفس شكل GET /orders/:id (أرقام + إحداثيات) عشان التطبيق يفكّ الرد بنفس الموديل.
    // النقط دي متقروءة فوق أصلاً للتحقق من نطاق التوصيل — مفيش استعلام زيادة.
    // `checkoutUrl` بيرجع مع الرد عشان التطبيق يفتح صفحة الدفع لو الطلب بطاقة.
    return this.mapOrder(order, { address: addressPoint, branch: branchPoint }, charge.checkoutUrl, {
      role: UserRole.CUSTOMER,
      customerId,
    });
  }

  /** جسم إنشاء الطلب في معاملة — منفصل عشان نعيد المحاولة عند تصادم رقم الطلب. */
  private createOrderTx(
    attempt: number,
    p: {
      customerId: string;
      branch: {
        id: string;
        restaurantId: string;
        deliveryFee: Prisma.Decimal | null;
        avgPrepMinutes: number;
      };
      address: { id: string };
      couponId: string | null | undefined;
      dto: CreateOrderDto;
      itemsData: Prisma.OrderItemCreateWithoutOrderInput[];
      subtotal: Decimal;
      deliveryFee: Decimal;
      discount: Decimal;
      vat: Decimal;
      total: Decimal;
      commission: Decimal;
      scheduledFor: Date | null;
      releaseAt: Date | null;
      tipAmount: Decimal;
      pointsRedeemed: number;
      requiresRelay: boolean;
    },
  ) {
    const { customerId, branch, address, couponId, dto, itemsData, subtotal, deliveryFee, discount, vat, total, commission, requiresRelay } = p;
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNumber: await this.generateOrderNumber(tx, attempt),
          pickupCode: this.generatePickupCode(),
          // كودين إضافيين لسلسلة التسليم بالتناوب: مركبة→مشي، ومشي→عميل.
          handoffCode: this.generatePickupCode(),
          deliveryCode: this.generatePickupCode(),
          customer: { connect: { id: customerId } },
          branch: { connect: { id: branch.id } },
          address: { connect: { id: address.id } },
          ...(couponId ? { coupon: { connect: { id: couponId } } } : {}),
          status: OrderStatus.PENDING,
          subtotal: subtotal.toFixed(2),
          deliveryFee: deliveryFee.toFixed(2),
          discount: discount.toFixed(2),
          vat: vat.toFixed(2),
          total: total.toFixed(2),
          commission: commission.toFixed(2),
          paymentMethod: dto.paymentMethod,
          paymentStatus: PaymentStatus.PENDING,
          scheduledFor: p.scheduledFor,
          releaseAt: p.releaseAt,
          tipAmount: p.tipAmount.toFixed(2),
          pointsRedeemed: p.pointsRedeemed,
          customerNotes: dto.customerNotes,
          requiresRelay,
          items: { create: itemsData },
        },
        include: this.orderInclude(),
      });

      await tx.orderEvent.create({
        // `actorId` = معرّف **المستخدم** في كل الأحداث. كان بيتكتب هنا
        // `customerId` (معرّف جدول العملاء) وفي مسارات تانية `userId`، فأي
        // تايم لاين بيحلّ الأسماء كان بيطلّع اسم غلط أو فاضي.
        data: {
          orderId: created.id,
          status: OrderStatus.PENDING,
          actorId: created.customer.userId,
          actorRole: UserRole.CUSTOMER,
        },
      });

      // خصم نقاط الولاء **جوه معاملة الطلب**: لو الطلب فشل بعد الخصم (تصادم
      // رقم، كوبون خلص)، النقاط ترجع معاه. الخصم برّه المعاملة كان هيسيب العميل
      // خاسر نقاطه بلا طلب.
      if (p.pointsRedeemed > 0) {
        await this.loyalty.debitRedemption(
          customerId,
          created.id,
          p.pointsRedeemed,
          created.orderNumber,
          tx,
        );
      }

      if (couponId) {
        // زيادة ذرّية مشروطة: بنزوّد العدّاد بس لو لسه تحت الحد (أو مافيش حد).
        // من غير الشرط ده، طلبين متزامنين بنفس الكوبون بيقروا usedCount القديم
        // ويعدّوا الاتنين فيتخطى usageLimit. لو 0 صفوف اتأثرت ⇒ الكوبون خلص.
        // (مقارنة عمودين مش ممكنة في Prisma where، فبنستخدم SQL خام.)
        const bumped = await tx.$executeRaw`
          UPDATE "coupons" SET "usedCount" = "usedCount" + 1
          WHERE "id" = ${couponId}
            AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")`;
        if (bumped === 0) {
          throw new BadRequestException('الكوبون خلص عدد مرات استخدامه');
        }
      }

      return created;
    });
  }

  private async generateOrderNumber(tx: Prisma.TransactionClient, attempt = 0): Promise<string> {
    // رقم قصير سهل النطق للمطابقة الصوتية بين المطعم والكابتن. المحاولة الأولى
    // من count()؛ لو اتصادم، المحاولات اللي بعدها برقم عشوائي عشان نفكّ التصادم.
    const count = await tx.order.count();
    const seq = attempt === 0 ? count % 9000 : Math.floor(Math.random() * 9000);
    const letter = String.fromCharCode(65 + (Math.floor(count / 9000) % 26));
    return `${letter}-${1000 + seq}`;
  }

  private generatePickupCode(): string {
    return String(Math.floor(1000 + Math.random() * 9000));
  }

  /** لو المطعم ما ردّش خلال المهلة، ننبّه الأدمن — الطلب معلّق والعميل مستني. */
  private scheduleUnansweredAlert(orderId: string) {
    const timeout = Number(this.config.get('NEW_ORDER_ALERT_TIMEOUT_SECONDS') ?? 180) * 1000;
    setTimeout(async () => {
      const order = await this.prisma.order.findUnique({ where: { id: orderId } });
      if (order?.status === OrderStatus.PENDING) {
        this.logger.warn(`الطلب ${order.orderNumber} لم يُرد عليه خلال المهلة`);
        this.gateway.emitAdminAlert({
          type: 'ORDER_UNANSWERED',
          orderId,
          orderNumber: order.orderNumber,
          branchId: order.branchId,
        });
      }
    }, timeout);
  }

  // ────────────────────────────────────────────────────────────
  // المطعم
  // ────────────────────────────────────────────────────────────

  /**
   * قبول الطلب مع وقت التحضير. لو الفرع في وضع "مشغول"، بيتضاف busyExtraMinutes تلقائياً.
   * وقت التحضير ده هو اللي بيحدد امتى نبدأ ندوّر على كابتن — راجع DispatchService.
   */
  async acceptOrder(user: AuthUser, orderId: string, dto: AcceptOrderDto) {
    const order = await this.assertBranchOwnership(user, orderId);
    const branch = await this.prisma.branch.findUnique({ where: { id: order.branchId } });

    let prepMinutes = dto.prepMinutes;
    if (branch?.status === RestaurantStatus.BUSY) {
      prepMinutes += branch.busyExtraMinutes;
    }

    const updated = await this.transition(
      orderId,
      OrderStatus.ACCEPTED,
      { id: user.userId, role: user.role },
      { prepMinutes },
      `وقت التحضير: ${prepMinutes} دقيقة`,
    );

    // جدولة البحث عن كابتن: يوصل المطعم والطلب جاهز — لا الكابتن يستنى ولا الأكل يبرد.
    // الجدولة بقت async (بتقرا الإعدادات من اللوحة) — بنمسك الخطأ عشان Promise
    // مرفوض من غير معالجة بيقتل السيرفر.
    void this.dispatch.scheduleDispatch(orderId, prepMinutes).catch((e) =>
      this.logger.error(`فشل جدولة توزيع الطلب ${orderId}: ${(e as Error).message}`),
    );

    return updated;
  }

  async rejectOrder(user: AuthUser, orderId: string, dto: RejectOrderDto) {
    await this.assertBranchOwnership(user, orderId);
    if (!dto.reason?.trim()) throw new BadRequestException('سبب الرفض إلزامي');

    return this.transition(
      orderId,
      OrderStatus.REJECTED,
      { id: user.userId, role: user.role },
      { rejectReason: dto.reason },
      dto.reason,
    );
  }

  async markPreparing(user: AuthUser, orderId: string) {
    await this.assertBranchOwnership(user, orderId);
    return this.transition(orderId, OrderStatus.PREPARING, { id: user.userId, role: user.role });
  }

  /** زر «جاهز» — بيبلّغ الكابتن المسند إن الطلب مستني الاستلام. */
  async markReady(user: AuthUser, orderId: string) {
    await this.assertBranchOwnership(user, orderId);
    const ready = await this.transition(orderId, OrderStatus.READY, { id: user.userId, role: user.role });

    // بنقرأ الكابتن **بعد** الانتقال (مش قراءة قديمة): التوزيع بيبدأ قبل الجاهزية،
    // فكابتن ممكن يكون قبِل العرض والطلب لسه بيتحضّر. ساعتها الإسناد اتسجّل
    // (captainId) لكن الحالة فضلت PREPARING/READY. دلوقتي الطلب جاهز فبننقله
    // لـ CAPTAIN_ASSIGNED عشان الاستلام يشتغل — من غير ده الطلب كان بيعلق في READY
    // (READY → PICKED_UP مرفوض) والكابتن بيفضل ON_TRIP للأبد.
    const fresh = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { captainId: true },
    });

    if (fresh?.captainId) {
      const assigned = await this.transition(orderId, OrderStatus.CAPTAIN_ASSIGNED, {
        id: user.userId,
        role: user.role,
      });
      this.gateway.emitOrderReady(fresh.captainId, assigned);
      return assigned;
    }

    // مافيش كابتن لسه — دوّر دلوقتي حالاً. الـ catch عشان فشل التوزيع في الخلفية
    // مايبقاش Promise مرفوض يقع السيرفر.
    void this.dispatch.dispatchNow(orderId).catch((e) =>
      this.logger.error(`فشل توزيع الطلب ${orderId} بعد الجاهزية: ${(e as Error).message}`),
    );
    return ready;
  }

  // ────────────────────────────────────────────────────────────
  // الكابتن
  // ────────────────────────────────────────────────────────────

  async captainPickup(user: AuthUser, orderId: string, pickupCode: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('الطلب غير موجود');
    if (order.captainId !== user.captainId) throw new ForbiddenException('هذا الطلب غير مسند لك');
    if (order.pickupCode !== pickupCode) throw new BadRequestException('كود الاستلام غير صحيح');

    return this.transition(orderId, OrderStatus.PICKED_UP, { id: user.userId, role: user.role });
  }

  async markOnTheWay(user: AuthUser, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    // في التوصيل بالتناوب، مندوب المشي (footCaptainId) هو اللي بيكمّل داخل الحرم.
    if (!order || !this.isCarrier(order, user.captainId)) {
      throw new ForbiddenException('هذا الطلب غير مسند لك');
    }
    return this.transition(orderId, OrderStatus.ON_THE_WAY, { id: user.userId, role: user.role });
  }

  /** الكابتن الحامل للطلب حالياً: مندوب المركبة أو مندوب المشي (في التناوب). */
  private isCarrier(order: { captainId: string | null; footCaptainId: string | null }, captainId?: string) {
    return !!captainId && (order.captainId === captainId || order.footCaptainId === captainId);
  }

  /** التسليم = إقفال الحساب المالي. يتطلب **كود العميل** + صورة إثبات. */
  async markDelivered(user: AuthUser, orderId: string, code: string, photoUrl?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        captain: { select: { companyId: true } },
        footCaptain: { select: { id: true, companyId: true } },
      },
    });
    if (!order) throw new NotFoundException('الطلب غير موجود');
    // في التناوب، مندوب المشي هو اللي بيسلّم للعميل جوّه الحرم؛ في العادي مندوب المركبة.
    if (!this.isCarrier(order, user.captainId)) throw new ForbiddenException('هذا الطلب غير مسند لك');
    // كود العميل — إثبات إن الطلب اتسلّم للشخص الصح.
    if (order.deliveryCode !== code?.trim()) {
      throw new BadRequestException('كود التسليم غير صحيح');
    }

    const captainPayout = await this.dispatch.calculatePayout(order.id);
    // أجر مندوب المشي (رجلة الحرم) — قيمة ثابتة قابلة للضبط.
    const footPayout = order.footCaptainId
      ? new Decimal(this.config.get<string>('HARAM_FOOT_PAYOUT') ?? 10)
      : new Decimal(0);

    const updated = await this.transition(
      orderId,
      OrderStatus.DELIVERED,
      { id: user.userId, role: user.role },
      {
        captainPayout: captainPayout.toFixed(2),
        ...(photoUrl ? { deliveryPhotoUrl: photoUrl } : {}),
        ...(order.paymentMethod === PaymentMethod.CASH ? { paymentStatus: PaymentStatus.PAID } : {}),
      },
    );

    // الكاش اتقبض عند الباب — لازم عملية التحصيل نفسها تتقفل، مش حالة الطلب بس.
    if (order.paymentMethod === PaymentMethod.CASH) {
      await this.payments.captureCashOnDelivery(orderId);
    }

    // تحرير **الكابتنين** (المركبة + المشي) ورجوعهم متاحين + تحديث ورديّاتهم.
    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.captain.updateMany({
        where: {
          id: { in: [order.captainId, order.footCaptainId].filter(Boolean) as string[] },
          status: 'ON_TRIP',
        },
        data: { status: 'ONLINE' },
      }),
    ];
    if (order.captainId) {
      ops.push(
        this.prisma.shift.updateMany({
          where: { captainId: order.captainId, endedAt: null },
          data: { tripCount: { increment: 1 }, earnings: { increment: captainPayout.toFixed(2) } },
        }),
      );
    }
    if (order.footCaptainId) {
      ops.push(
        this.prisma.shift.updateMany({
          where: { captainId: order.footCaptainId, endedAt: null },
          data: { tripCount: { increment: 1 }, earnings: { increment: footPayout.toFixed(2) } },
        }),
      );
    }
    await this.prisma.$transaction(ops);

    // مستحق كل مندوب مستقل بيتزوّد رصيده (idempotent لكل كابتن على حدة). التابع
    // لشركة بيتجمّع في تسوية الشركة (`order.captainPayout` اتخزّن فوق).
    if (order.captainId && !order.captain?.companyId) {
      await this.captains.creditTripPayout(order.captainId, order.id, Number(captainPayout.toFixed(2)));
    }
    if (order.footCaptainId && !order.footCaptain?.companyId) {
      await this.captains.creditTripPayout(order.footCaptainId, order.id, Number(footPayout.toFixed(2)));
    }

    // ── الإكرامية ──
    // بتروح للمندوب اللي سلّم للعميل فعلاً: مندوب المشي لو الطلب بالتناوب،
    // وإلا مندوب المركبة. اللي وصل للباب هو اللي العميل كرّمه.
    //
    // بتتقيّد للمندوب **حتى لو تابع لشركة**، بخلاف أجرة الرحلة اللي بتتجمّع في
    // تسوية الشركة: الإكرامية تكريم شخصي مش إيراد تشغيلي للشركة.
    //
    // بشرط إن الفلوس اتحصّلت فعلاً — إكرامية على دفع فشل مالهاش مصدر.
    const tip = Number(order.tipAmount);
    const tipRecipient = order.footCaptainId ?? order.captainId;
    if (tip > 0 && tipRecipient && updated.paymentStatus === PaymentStatus.PAID) {
      await this.captains.creditTip(tipRecipient, order.id, tip);
    }

    // ── نقاط الولاء ومكافأة الإحالة ──
    // بعد التسليم بس: نقاط على طلب لسه في الطريق معناها نقاط على طلب ممكن
    // يتلغى. الاتنين idempotent، فتسليم مكرر مايضاعفش حاجة.
    //
    // فشلهم مايوقّعش التسليم: الطلب وصل للعميل فعلاً، ومايصحش سطر نقاط يرجّع
    // حالة الطلب. بيتسجّل في اللوج عشان يتراجع.
    try {
      await this.loyalty.creditEarned(order.customerId, order.id, order.subtotal, order.orderNumber);
      await this.loyalty.rewardReferral(order.customerId, order.id, order.orderNumber);
    } catch (error) {
      this.logger.error(
        `فشل تسجيل نقاط الولاء للطلب ${order.orderNumber}: ${(error as Error).message}`,
      );
    }

    return updated;
  }

  // ────────────────────────────────────────────────────────────
  // الإلغاء والقراءة
  // ────────────────────────────────────────────────────────────

  async cancelOrder(user: AuthUser, orderId: string, dto: CancelOrderDto) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('الطلب غير موجود');

    // العميل يقدر يلغي قبل ما المطعم يقبل بس. الأدمن يقدر في أي وقت.
    if (user.role === UserRole.CUSTOMER) {
      if (order.customerId !== user.customerId) throw new ForbiddenException();
      if (order.status !== OrderStatus.PENDING) {
        throw new BadRequestException('لا يمكن إلغاء الطلب بعد قبوله من المطعم');
      }
    } else if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('غير مصرَّح لك بالإلغاء');
    }

    const updated = await this.transition(
      orderId,
      OrderStatus.CANCELLED,
      { id: user.userId, role: user.role },
      { cancelReason: dto.reason },
      dto.reason,
    );

    // اتلغى بعد ما اتدفع ⇒ الفلوس ترجع من غير ما حد يطلب. الاسترداد التلقائي
    // مابيرميش استثناء: الإلغاء نفسه نجح، وأي فشل في البوابة بيفضل صف PENDING.
    const refund = await this.payments.refundOnCancel(
      orderId,
      user.userId,
      `إلغاء الطلب — ${dto.reason ?? 'بدون سبب'}`,
    );
    if (refund) this.logger.log(`استرداد ${refund.amount} ر.س للطلب الملغي ${order.orderNumber}`);

    // نقاط الولاء المستبدلة ترجع: العميل ماخدش الخصم فعلاً. بسطر `REVERSAL`
    // منفصل مش بحذف سطر الاستبدال — الدفتر مابيتعدّلش بأثر رجعي.
    if (order.pointsRedeemed > 0) {
      try {
        await this.loyalty.reverseRedemption(
          order.customerId,
          orderId,
          order.pointsRedeemed,
          order.orderNumber,
        );
      } catch (error) {
        this.logger.error(
          `فشل رجوع نقاط الطلب الملغي ${order.orderNumber}: ${(error as Error).message}`,
        );
      }
    }

    // لو الطلب كان لسه في التوزيع، ألغي مؤقت البحث عن كابتن — مايفضلش يدوّر على
    // كابتن لطلب اتلغى.
    this.dispatch.cancelDispatch(orderId);
    // مؤقت إطلاق الطلب المجدول: `releaseScheduledOrder` بترفض أي طلب مش PENDING
    // فالإلغاء آمن من غير التنضيف ده، بس مافيش داعي نسيب مؤقت شغّال لطلب ميت.
    const releaseTimer = this.releaseTimers.get(orderId);
    if (releaseTimer) {
      clearTimeout(releaseTimer);
      this.releaseTimers.delete(orderId);
    }

    // كان عليه كابتن في مهمة → رجّعه متاح (المركبة + المشي في التناوب). من غير
    // ده الكابتن بيفضل ON_TRIP للأبد فمش هياخد عروض جديدة. الشرط على الحالة عشان
    // مانلمسش كابتن راح أوفلاين أو دخل مهمة تانية.
    const busyCaptainIds = [order.captainId, order.footCaptainId].filter(Boolean) as string[];
    if (busyCaptainIds.length) {
      await this.prisma.captain.updateMany({
        where: { id: { in: busyCaptainIds }, status: 'ON_TRIP' },
        data: { status: 'ONLINE' },
      });
    }

    this.gateway.emitOrderCancelledToBranch(updated);
    if (order.captainId) this.gateway.emitTripCancelled(order.captainId, orderId);
    return updated;
  }

  /** الطلب الواحد — بإحداثيات العنوان والفرع عشان خريطة التتبع. */
  async findOne(user: AuthUser, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: this.orderInclude() });
    if (!order) throw new NotFoundException('الطلب غير موجود');

    const allowed =
      user.role === UserRole.ADMIN ||
      (user.role === UserRole.CUSTOMER && order.customerId === user.customerId) ||
      (user.role === UserRole.CAPTAIN && order.captainId === user.captainId) ||
      (user.role === UserRole.MERCHANT && order.branchId === user.branchId);

    if (!allowed) throw new ForbiddenException();

    const [address, branch] = await Promise.all([
      this.prisma.getPoint('addresses', 'location', order.addressId),
      this.prisma.getPoint('branches', 'location', order.branchId),
    ]);

    return this.mapOrder(order, { address, branch }, null, user);
  }

  async list(user: AuthUser, query: ListOrdersDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);

    const where: Prisma.OrderWhereInput = {};

    // مهم: لو المعرّف مش موجود في التوكن، Prisma بتتجاهل الشرط `undefined`
    // وترجّع **كل** الطلبات — تسريب بيانات. فبنرفض الطلب صراحةً بدل كده.
    // **fail-closed**: أي دور مش متعامَل معاه صراحةً بيتمنع بدل ما يشوف كل الطلبات
    // (كان دور COMPANY وأي دور جديد بيتسرّبله كل طلبات المنصة).
    if (user.role === UserRole.MERCHANT) {
      if (!user.branchId) throw new ForbiddenException('الجلسة غير مرتبطة بفرع');
      where.branchId = user.branchId;
    } else if (user.role === UserRole.CUSTOMER) {
      if (!user.customerId) throw new ForbiddenException('الجلسة غير مرتبطة بحساب عميل');
      where.customerId = user.customerId;
    } else if (user.role === UserRole.CAPTAIN) {
      if (!user.captainId) throw new ForbiddenException('الجلسة غير مرتبطة بحساب كابتن');
      where.captainId = user.captainId;
    } else if (user.role === UserRole.COMPANY) {
      // شركة الأسطول بتشوف طلبات مناديبها بس.
      if (!user.companyId) throw new ForbiddenException('الجلسة غير مرتبطة بشركة');
      where.captain = { companyId: user.companyId };
    } else if (user.role === UserRole.ADMIN) {
      if (query.branchId) where.branchId = query.branchId;
    } else {
      throw new ForbiddenException('غير مصرَّح لك');
    }

    if (query.status?.length) where.status = { in: query.status };

    // بحث نصي — رقم الطلب أو اسم/جوال العميل أو اسم الكابتن أو اسم الفرع.
    // بيتحط في `AND` مش في `where.OR` عشان مايكتبش فوق شروط الدور: دور
    // COMPANY بيستخدم `where.captain`، ولو البحث حطّ `OR` على مستوى أعلى كان
    // ممكن يوسّع النتيجة لبرّه نطاق الشركة — تسريب بيانات.
    const q = query.q?.trim();
    if (q) {
      const like = { contains: q, mode: Prisma.QueryMode.insensitive };
      const existing = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
      where.AND = [
        ...existing,
        {
          OR: [
            { orderNumber: like },
            { customer: { user: { fullName: like } } },
            { customer: { user: { phone: like } } },
            { captain: { user: { fullName: like } } },
            { branch: { nameAr: like } },
          ],
        },
      ];
    }
    if (query.from || query.to) {
      where.placedAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const [orders, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: this.orderInclude(),
        orderBy: { placedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);

    // استعلامين بس لكل الصفحة — مش نقطتين لكل طلب
    const [addressPoints, branchPoints] = await Promise.all([
      this.pointsByIds('addresses', orders.map((o) => o.addressId)),
      this.pointsByIds('branches', orders.map((o) => o.branchId)),
    ]);

    const data = orders.map((order) =>
      this.mapOrder(
        order,
        {
          address: addressPoints.get(order.addressId),
          branch: branchPoints.get(order.branchId),
        },
        null,
        user,
      ),
    );

    return { data, total, page, pageSize };
  }

  /**
   * سجل أحداث الطلب — «مين عمل إيه وامتى».
   *
   * `order_events` كان بيتسجّل ومابيترجعش، فالتايم لاين في اللوحة كان مبني من
   * أعمدة الوقت في الطلب نفسه: بيقول إن الحالة اتغيّرت، مش مين غيّرها. ده
   * المصدر الحقيقي، وبيشمل الأحداث اللي مالهاش عمود (زي الإسناد اليدوي).
   *
   * فحص الصلاحية بيتم بـ `findOne` — نفس قواعد عرض الطلب بالظبط، عشان
   * مايبقاش فيه مسار تاني بقواعد أضعف.
   */
  async events(user: AuthUser, orderId: string) {
    await this.findOne(user, orderId);

    const events = await this.prisma.orderEvent.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });

    // أسماء الفاعلين في استعلام واحد لكل السجل — مش استعلام لكل حدث.
    const actorIds = [...new Set(events.map((e) => e.actorId).filter((id): id is string => !!id))];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const names = new Map(actors.map((a) => [a.id, a.fullName]));

    return events.map((e) => ({
      id: e.id,
      status: e.status,
      actorId: e.actorId,
      actorRole: e.actorRole,
      /** null لو الفاعل هو النظام، أو لو المستخدم اتحذف بعد الحدث. */
      actorName: e.actorId ? (names.get(e.actorId) ?? null) : null,
      note: e.note,
      createdAt: e.createdAt,
    }));
  }

  /** الطلبات الواردة (شاشة ٢ في تطبيق المطعم) — الجديدة اللي لسه مردودش عليها. */
  async incomingForBranch(branchId: string) {
    return this.prisma.order.findMany({
      where: {
        branchId,
        status: OrderStatus.PENDING,
        // الطلب المجدول اللي لسه ماتطلقش مش «وارد» — بيظهر للمطعم وقت الإطلاق
        // بس. من غير الشرط ده كل الطلبات المجدولة تبان في شاشة الواردة فوراً
        // وتفضل هناك أيام.
        OR: [{ scheduledFor: null }, { releasedAt: { not: null } }],
      },
      include: this.orderInclude(),
      orderBy: { placedAt: 'asc' },
    });
  }

  /**
   * إطلاق طلب مجدول للمطعم — نفس اللي بيحصل لحظة إنشاء طلب فوري، بس متأخر.
   *
   * idempotent: الإطلاق المتكرر (مؤقت اشتغل + دورة الاسترجاع لقيته) مابيبعتش
   * إشعارين، لأن `releasedAt` بيتحدّث مرة واحدة بشرط إنه لسه فاضي.
   */
  private async releaseScheduledOrder(orderId: string): Promise<void> {
    const updated = await this.prisma.order.updateMany({
      where: { id: orderId, status: OrderStatus.PENDING, releasedAt: null },
      data: { releasedAt: new Date() },
    });
    if (updated.count === 0) return; // اتطلق قبل كده، أو اتلغى

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: this.orderInclude(),
    });
    if (!order) return;

    this.logger.log(`إطلاق الطلب المجدول ${order.orderNumber} للمطعم`);
    this.gateway.emitNewOrder(order);
    this.scheduleUnansweredAlert(order.id);
  }

  /** مؤقت الإطلاق في الذاكرة — بيتعاد بناؤه عند الإقلاع من `releasedAt`. */
  private scheduleRelease(orderId: string, at: Date) {
    const delay = Math.max(0, at.getTime() - Date.now());
    const timer = setTimeout(() => {
      this.releaseTimers.delete(orderId);
      void this.releaseScheduledOrder(orderId).catch((e) =>
        this.logger.error(`فشل إطلاق الطلب المجدول ${orderId}: ${(e as Error).message}`),
      );
    }, delay);
    this.releaseTimers.set(orderId, timer);
  }

  /**
   * بعد إعادة تشغيل السيرفر مؤقتات الإطلاق بتضيع، فطلب مجدول كان مستني
   * بيفضل مخفي عن المطعم **للأبد** والعميل يستنى أكل مش جاي. بنعيد جدولة كل
   * الطلبات المجدولة اللي لسه ماتطلقتش عند الإقلاع — ونطلق فوراً اللي وقته فات
   * وإحنا واقعين.
   */
  async onModuleInit() {
    const pending = await this.prisma.order.findMany({
      where: { status: OrderStatus.PENDING, scheduledFor: { not: null }, releasedAt: null },
      select: { id: true, releaseAt: true },
    });
    for (const o of pending) this.scheduleRelease(o.id, o.releaseAt ?? new Date());
    if (pending.length) {
      this.logger.log(`أعيد جدولة إطلاق ${pending.length} طلب مجدول بعد إعادة التشغيل`);
    }
  }

  /** الطلبات الجارية (شاشة ٤) — من القبول لحد الاستلام. */
  async activeForBranch(branchId: string) {
    return this.prisma.order.findMany({
      where: {
        branchId,
        status: {
          in: [
            OrderStatus.ACCEPTED,
            OrderStatus.PREPARING,
            OrderStatus.READY,
            OrderStatus.CAPTAIN_ASSIGNED,
            OrderStatus.PICKED_UP,
          ],
        },
      },
      include: this.orderInclude(),
      orderBy: { acceptedAt: 'asc' },
    });
  }

  // ────────────────────────────────────────────────────────────
  // التقييم (شاشة التقييم في تطبيق العميل)
  // ────────────────────────────────────────────────────────────

  /**
   * تقييم واحد لكل طلب (Review.orderId فريد)، وبعد التسليم بس.
   * التقييم بيتخزّن وبيتحدّث متوسط الفرع (والكابتن لو اتقيّم) في نفس المعاملة —
   * عشان ما يحصلش تقييم متسجّل ومتوسط قديم.
   */
  async createReview(customerId: string, orderId: string, dto: CreateReviewDto) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId },
      include: { review: true },
    });
    if (!order) throw new NotFoundException('الطلب غير موجود');
    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException('لا يمكن تقييم طلب لم يُسلَّم بعد');
    }
    if (order.review) throw new BadRequestException('قيّمت هذا الطلب مسبقاً');

    const captainStars = dto.captainStars;
    const captainId = order.captainId;

    try {
      const review = await this.prisma.$transaction(async (tx) => {
        const created = await tx.review.create({
          data: {
            order: { connect: { id: order.id } },
            customer: { connect: { id: customerId } },
            restaurantStars: dto.restaurantStars,
            captainStars,
            comment: dto.comment,
          },
        });

        const branch = await tx.branch.findUniqueOrThrow({
          where: { id: order.branchId },
          select: { rating: true, ratingCount: true },
        });
        await tx.branch.update({
          where: { id: order.branchId },
          data: {
            rating: this.nextAverage(branch.rating, branch.ratingCount, dto.restaurantStars),
            ratingCount: { increment: 1 },
          },
        });

        if (captainStars && captainId) {
          const captain = await tx.captain.findUniqueOrThrow({
            where: { id: captainId },
            select: { rating: true, ratingCount: true },
          });
          await tx.captain.update({
            where: { id: captainId },
            data: {
              rating: this.nextAverage(captain.rating, captain.ratingCount, captainStars),
              ratingCount: { increment: 1 },
            },
          });
        }

        return created;
      });

      return this.mapReview(review);
    } catch (error) {
      // سباق بين طلبين تقييم في نفس اللحظة — القيد الفريد على orderId هو الحكم
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('قيّمت هذا الطلب مسبقاً');
      }
      throw error;
    }
  }

  /** المتوسط الجديد بعد إضافة تقييم — مقرّب لخانة عشرية واحدة (العمود Decimal(2,1)). */
  private nextAverage(current: Prisma.Decimal, count: number, stars: number): number {
    const total = Number(current) * count + stars;
    return Math.round((total / (count + 1)) * 10) / 10;
  }

  private mapReview(review: Review) {
    return {
      ...review,
      restaurantStars: Number(review.restaurantStars),
      captainStars: review.captainStars === null ? null : Number(review.captainStars),
    };
  }

  // ────────────────────────────────────────────────────────────
  // إعادة الطلب (زر «اطلب مجدداً»)
  // ────────────────────────────────────────────────────────────

  /**
   * بيرجّع البيانات اللي التطبيق يملى بيها السلة من طلب قديم — من غير ما ينشئ أي حاجة.
   * الطلب بيخزّن snapshot للأسماء والأسعار مش ids، فبنرجّع نطابق الخيارات بالاسم العربي
   * على المنيو الحالي. أي صنف اتشال أو موقوف بيرجع unavailable عشان التطبيق يوضّحه للعميل.
   */
  async reorder(customerId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId },
      include: { items: { include: { options: true } } },
    });
    if (!order) throw new NotFoundException('الطلب غير موجود');

    const menuItems = await this.prisma.menuItem.findMany({
      where: { id: { in: order.items.map((i) => i.menuItemId) } },
      include: { optionGroups: { include: { options: true } } },
    });

    const items = order.items.map((line) => {
      const menuItem = menuItems.find((m) => m.id === line.menuItemId);

      const optionIds = line.options.flatMap((snapshot) => {
        if (!menuItem) return [];
        // المطابقة جوه المجموعة الأصلية الأول، وبعدين في أي مجموعة (لو المجموعة اتسمّت من جديد)
        const inSameGroup = menuItem.optionGroups
          .filter((g) => g.nameAr === snapshot.groupNameAr)
          .flatMap((g) => g.options)
          .find((o) => o.nameAr === snapshot.nameAr);
        const match =
          inSameGroup ??
          menuItem.optionGroups.flatMap((g) => g.options).find((o) => o.nameAr === snapshot.nameAr);
        // الخيارات اللي اتشالت من المنيو بتتسقط بدل ما تفشّل إنشاء الطلب
        return match ? [match.id] : [];
      });

      return {
        menuItemId: line.menuItemId,
        quantity: line.quantity,
        notes: line.notes,
        optionIds,
        unavailable: !menuItem || menuItem.availability === ItemAvailability.OUT_OF_STOCK,
      };
    });

    return { branchId: order.branchId, items };
  }

  private async assertBranchOwnership(user: AuthUser, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('الطلب غير موجود');
    if (user.role !== UserRole.ADMIN && order.branchId !== user.branchId) {
      throw new ForbiddenException('هذا الطلب لا يخص فرعك');
    }
    return order;
  }
}
