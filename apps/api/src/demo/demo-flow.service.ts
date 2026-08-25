// محرّك العرض الحيّ — بيخلّي المنصة تنبض زي ساعة الذروة.
//
// ⚠️ للتطوير/العرض بس (متحكوم بـ `DEMO_FLOW`، وبيتوقف في الإنتاج). مش أحداث
// مزيّفة: بيسوق **طلبات حقيقية** عبر نفس خدمات النظام (createOrder → acceptOrder →
// preparing → ready → إسناد كابتن → استلام → في الطريق → تسليم → تقييم)، فكل
// حدث سوكيت وكل ريال بيتحرّك في التقارير مصدره طلب فعلي في قاعدة البيانات.
//
// أثناء الرحلة بيسوق الكابتن المسند من المطعم لبيت العميل على الخريطة (بنفس
// قناة البثّ)، وبينسّق مع LiveSimService إنه يسيب الكابتن ده له طول الرحلة
// ويرجّعه بعد التسليم — فمافيش تصادم في التحريك.

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CaptainStatus, PaymentMethod, RestaurantStatus, UserRole } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { DispatchService } from '../dispatch/dispatch.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { LiveSimService } from '../tracking/live-sim.service';
import type { AuthUser } from '../common';

interface DemoCaptain {
  id: string;
  userId: string;
}

interface OrderTemplate {
  customerId: string;
  merchantUser: AuthUser;
  branchLat: number;
  branchLng: number;
  dropLat: number;
  dropLng: number;
  dto: {
    branchId: string;
    addressId: string;
    paymentMethod: PaymentMethod;
    items: { menuItemId: string; quantity: number; optionIds: string[] }[];
  };
}

// العميل «المميّز» للعرض — بنخلّي عنده طلب حيّ دايماً عشان شاشة تتبّع تطبيق
// العميل تلاقي كابتن بيتحرّك ناحية بيته أول ما تفتحها. بنعرّفه بالتليفون مش
// بالـ id عشان الـ id بيتغيّر مع كل إعادة seed.
const FEATURED_CUSTOMER_PHONE = '0575420596';

const COMMENTS = [
  'الأكل وصل سخن والكابتن محترم',
  'سريع وممتاز، شكراً',
  'التغليف نضيف والطعم رهيب',
  'توصيل أسرع من المتوقع',
  'تجربة ممتازة زي كل مرة',
  'الكابتن كان لطيف والطلب مظبوط',
];

// شكاوى واقعية — نسبة بسيطة من التقييمات بتبقى منخفضة عشان شاشة الجودة يبان
// فيها الفروع اللي محتاجة متابعة (مش كل العملاء مبسوطين).
const LOW_COMMENTS = [
  'الأكل وصل بارد والطلب اتأخر',
  'نقص صنف من الطلب',
  'التغليف مكانش نضيف',
  'الكابتن اتأخر كتير',
];

@Injectable()
export class DemoFlowService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DemoFlowService.name);
  private timer: NodeJS.Timeout | null = null;
  private disposed = false;

  private templates: OrderTemplate[] = [];
  private featuredTemplates: OrderTemplate[] = []; // طلبات العميل المميّز (تتبّع تطبيق العميل)
  private captains: DemoCaptain[] = [];
  private running = 0;
  private featuredBusy = false;
  private readonly busyCaptains = new Set<string>();
  private seq = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly dispatch: DispatchService,
    private readonly gateway: TrackingGateway,
    private readonly liveSim: LiveSimService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    const enabled = String(this.config.get('DEMO_FLOW') ?? '').toLowerCase();
    if (enabled !== '1' && enabled !== 'true') return;
    if (this.config.get('NODE_ENV') === 'production') return;

    try {
      await this.buildTemplates();
    } catch (err) {
      this.logger.error(`فشل تجهيز قوالب العرض: ${(err as Error).message}`);
      return;
    }

    if (!this.templates.length || !this.captains.length) {
      this.logger.warn('DEMO_FLOW شغّال بس مفيش قوالب طلبات أو كباتن صالحة — مفيش حركة');
      return;
    }

    this.logger.warn(
      `DEMO_FLOW شغّال — ${this.templates.length} قالب طلب${
        this.featuredTemplates.length ? ` (+${this.featuredTemplates.length} للعميل المميّز)` : ''
      } · ${this.captains.length} كابتن · بيبدأ طلب كل ~١٢ ثانية (تطوير بس)`,
    );
    // أول طلب بعد ثواني عشان اللوحة تكون فتحت، وبعدين إيقاع منتظم.
    this.timer = setInterval(() => void this.tick(), 12000);
    setTimeout(() => void this.tick(), 3000);
    // العميل المميّز: طلب حيّ دايماً عشان شاشة تتبّع تطبيق العميل.
    if (this.featuredTemplates.length) setTimeout(() => void this.runFeatured(), 6000);
  }

  onModuleDestroy() {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
  }

  // ── تجهيز القوالب: عملاء بعناوين + فروع مفتوحة في النطاق + أصناف بسيطة ──
  private async buildTemplates() {
    // كباتن أونلاين ليهم مستخدم — دول اللي هنسندلهم الرحلات.
    const captainRows = await this.prisma.captain.findMany({
      where: { status: { in: [CaptainStatus.ONLINE, CaptainStatus.ON_TRIP] } },
      select: { id: true, userId: true },
    });
    this.captains = captainRows.filter((c) => !!c.userId).map((c) => ({ id: c.id, userId: c.userId }));

    // فروع مفتوحة نشطة. الأصناف بتتبع المطعم (مش الفرع): `branchId = null` معناه
    // متاح في كل فروع المطعم، فبنجيبها عبر المطعم مش عبر علاقة الفرع المباشرة.
    const branches = await this.prisma.branch.findMany({
      where: { isActive: true, status: RestaurantStatus.OPEN },
      select: { id: true, restaurantId: true, minOrderTotal: true, deliveryRadiusKm: true },
    });

    interface BranchInfo {
      id: string;
      lat: number;
      lng: number;
      radiusKm: number;
      merchantUser: AuthUser;
      items: { menuItemId: string; quantity: number; optionIds: string[] }[];
    }

    const branchInfos: BranchInfo[] = [];
    for (const b of branches) {
      const pt = await this.prisma.getPoint('branches', 'location', b.id);
      if (!pt) continue;

      // مستخدم المطعم مربوط بالفرع عبر جدول العضوية MerchantUser.
      const membership = await this.prisma.merchantUser.findFirst({
        where: { branchId: b.id },
        select: { userId: true },
      });
      if (!membership) continue;

      // أصناف المطعم المتاحة (المشتركة + الخاصة بالفرع).
      const menuItems = await this.prisma.menuItem.findMany({
        where: {
          availability: 'AVAILABLE',
          category: { restaurantId: b.restaurantId },
          OR: [{ branchId: null }, { branchId: b.id }],
        },
        select: { id: true, price: true, optionGroups: { select: { isRequired: true } } },
      });

      // أصناف من غير أي مجموعة خيارات إجبارية — نبنيها بأمان بدون اختيارات.
      const simple = menuItems.filter((m) => !m.optionGroups.some((g) => g.isRequired) && Number(m.price) > 0);
      if (!simple.length) continue;

      const minOrder = Number(b.minOrderTotal ?? 0);
      // نبني سلة توصل الحد الأدنى: صنف رئيسي بكمية كافية + ٥٠٪ فرصة صنف تاني.
      const primary = simple[0];
      const qty = Math.max(1, Math.ceil((minOrder + 1) / Number(primary.price)));
      const items = [{ menuItemId: primary.id, quantity: Math.min(qty, 4), optionIds: [] as string[] }];
      if (simple[1]) items.push({ menuItemId: simple[1].id, quantity: 1, optionIds: [] });

      branchInfos.push({
        id: b.id,
        lat: pt.lat,
        lng: pt.lng,
        radiusKm: Number(b.deliveryRadiusKm ?? 10),
        merchantUser: { userId: membership.userId, role: UserRole.MERCHANT, branchId: b.id },
        items,
      });
    }

    if (!branchInfos.length) return;

    // عناوين العملاء اللي ليها موقع — نطابق كل عنوان بأقرب فرع في نطاقه.
    const addresses = await this.prisma.address.findMany({ select: { id: true, customerId: true } });
    for (const addr of addresses) {
      const pt = await this.prisma.getPoint('addresses', 'location', addr.id);
      if (!pt) continue;

      let best: BranchInfo | null = null;
      let bestKm = Infinity;
      for (const b of branchInfos) {
        const km = this.haversineKm(b.lat, b.lng, pt.lat, pt.lng);
        if (km <= b.radiusKm && km < bestKm) {
          best = b;
          bestKm = km;
        }
      }
      if (!best) continue;

      this.templates.push({
        customerId: addr.customerId,
        merchantUser: best.merchantUser,
        branchLat: best.lat,
        branchLng: best.lng,
        dropLat: pt.lat,
        dropLng: pt.lng,
        dto: {
          branchId: best.id,
          addressId: addr.id,
          paymentMethod: PaymentMethod.CASH, // كاش يتقبض عند الباب → مدفوع فعلاً وقت التسليم
          items: best.items,
        },
      });
    }

    // نفصل قوالب العميل المميّز عن العامة — العامة تخدم باقي العملاء، والمميّزة
    // بتفضل تدوّر لوحدها عشان تطبيق العميل يلاقي طلب حيّ دايماً. بنجيبه بالتليفون
    // (الـ id بيتغيّر مع الـ seed).
    const featured = await this.prisma.user.findFirst({
      where: { phone: FEATURED_CUSTOMER_PHONE },
      select: { customer: { select: { id: true } } },
    });
    const featuredId = featured?.customer?.id;
    if (featuredId) {
      this.featuredTemplates = this.templates.filter((t) => t.customerId === featuredId);
      this.templates = this.templates.filter((t) => t.customerId !== featuredId);
    }
  }

  // ── الإيقاع: كل تكّة نبدأ رحلة لو فيه كابتن فاضي وتحت سقف التزامن ──
  private async tick() {
    if (this.disposed) return;
    const maxConcurrent = Math.max(1, Math.min(2, this.captains.length - 3));
    if (this.running >= maxConcurrent) return;

    if (!this.templates.length) return;
    const captain = this.captains.find((c) => !this.busyCaptains.has(c.id));
    if (!captain) return;
    const tpl = this.templates[this.seq % this.templates.length];
    this.seq += 1;

    this.running += 1;
    this.busyCaptains.add(captain.id);
    this.runLifecycle(tpl, captain)
      .catch((err) => this.logger.warn(`رحلة عرض فشلت: ${(err as Error).message}`))
      .finally(() => {
        this.running -= 1;
        this.busyCaptains.delete(captain.id);
      });
  }

  // ── العميل المميّز: طلب حيّ واحد دايماً — أول ما يتسلّم، نبدأ اللي بعده ──
  // كده تطبيق العميل يلاقي كابتن بيتحرّك ناحية بيته في أي وقت يفتح فيه التتبّع.
  private async runFeatured() {
    if (this.disposed || this.featuredBusy || !this.featuredTemplates.length) return;

    const captain = this.captains.find((c) => !this.busyCaptains.has(c.id));
    if (!captain) {
      // كل الكباتن مشغولين — نجرّب تاني بعد شوية.
      setTimeout(() => void this.runFeatured(), 5000);
      return;
    }

    const tpl = this.featuredTemplates[this.seq % this.featuredTemplates.length];
    this.seq += 1;
    this.featuredBusy = true;
    this.busyCaptains.add(captain.id);
    this.runLifecycle(tpl, captain, true)
      .catch((err) => this.logger.warn(`رحلة العميل المميّز فشلت: ${(err as Error).message}`))
      .finally(() => {
        this.featuredBusy = false;
        this.busyCaptains.delete(captain.id);
        // نبدأ الطلب المميّز اللي بعده فوراً (بمهلة بسيطة) عشان يفضل فيه طلب حيّ.
        if (!this.disposed) setTimeout(() => void this.runFeatured(), 4000);
      });
  }

  // ── دورة حياة طلب كاملة عبر الخدمات الحقيقية ──
  // ترتيب الحالات مقيّد: READY → CAPTAIN_ASSIGNED → PICKED_UP → ON_THE_WAY →
  // DELIVERED. فالإسناد لازم يتم **والطلب READY** عشان handleOfferResponse
  // ينقله لـ CAPTAIN_ASSIGNED — وبعدين الاستلام يشتغل.
  private async runLifecycle(tpl: OrderTemplate, captain: DemoCaptain, featured = false) {
    const captainUser: AuthUser = { userId: captain.userId, role: UserRole.CAPTAIN, captainId: captain.id };
    const tag = featured ? '⭐ طلب العميل المميّز' : '🆕 طلب عرض';

    const order = await this.orders.createOrder(tpl.customerId, tpl.dto as any);
    this.logger.log(`${tag} #${order.orderNumber ?? order.id.slice(0, 6)} اتعمل`);
    await this.sleep(4000);
    if (this.disposed) return;

    await this.orders.acceptOrder(tpl.merchantUser, order.id, { prepMinutes: 2 });
    await this.sleep(3000);
    if (this.disposed) return;

    await this.orders.markPreparing(tpl.merchantUser, order.id);
    await this.sleep(3000);
    if (this.disposed) return;

    // الطلب جاهز — لسه من غير كابتن (فـ markReady بيطلب البحث)، وبعدين بنسند
    // كابتننا فوراً فيتلغي البحث ويتنقل الطلب لـ CAPTAIN_ASSIGNED.
    await this.orders.markReady(tpl.merchantUser, order.id);

    // من هنا الكابتن متحمّل مسؤولية — أي فشل لازم يرجّعه ONLINE ويفكّ الحجز.
    this.liveSim.claimForTrip(captain.id);
    this.gateway.broadcastCaptainLocation(captain.id, num(tpl.branchLat), num(tpl.branchLng));
    try {
      const assigned = await this.dispatch.handleOfferResponse(captain.id, order.id, true);
      if (!assigned) throw new Error('تعذّر إسناد الكابتن');
      await this.sleep(2500);
      if (this.disposed) return;

      const fresh = await this.prisma.order.findUnique({
        where: { id: order.id },
        select: { pickupCode: true, deliveryCode: true, status: true },
      });
      await this.orders.captainPickup(captainUser, order.id, fresh?.pickupCode ?? '');
      await this.orders.markOnTheWay(captainUser, order.id);

      // يسوق من المطعم لبيت العميل — على خريطة الأدمن **وشاشة تتبّع العميل**.
      await this.driveRoute(captain.id, order.id, tpl.branchLat, tpl.branchLng, tpl.dropLat, tpl.dropLng);
      if (this.disposed) return;

      await this.orders.markDelivered(captainUser, order.id, fresh?.deliveryCode ?? '');
      this.liveSim.releaseFromTrip(captain.id, tpl.dropLat, tpl.dropLng);
      this.logger.log(`✅ ${featured ? 'طلب العميل المميّز' : 'طلب عرض'} اتسلّم — كابتن ${captain.id.slice(0, 6)}`);
    } catch (err) {
      // فشل بعد الإسناد — رجّع الكابتن أونلاين وفكّ الحجز عشان مايتعلّقش.
      await this.prisma.captain
        .update({ where: { id: captain.id }, data: { status: CaptainStatus.ONLINE } })
        .catch(() => undefined);
      this.liveSim.releaseFromTrip(captain.id, tpl.branchLat, tpl.branchLng);
      throw err;
    }

    // تقييم من وقت للتاني — بيحرّك متوسط تقييم المطعم والكابتن.
    await this.sleep(3000);
    if (this.disposed) return;
    if ((this.seq + captain.id.charCodeAt(0)) % 10 < 7) {
      // ~١ من كل ٥ تقييمات منخفض (شكوى) — عشان شاشة الجودة تبان حيّة بمشاكل حقيقية.
      const low = this.seq % 5 === 0;
      await this.orders
        .createReview(tpl.customerId, order.id, {
          restaurantStars: low ? 2 + (this.seq % 2) : 4 + (this.seq % 2),
          captainStars: low ? 3 : 4 + ((this.seq + 1) % 2),
          comment: low ? LOW_COMMENTS[this.seq % LOW_COMMENTS.length] : COMMENTS[this.seq % COMMENTS.length],
        })
        .catch(() => undefined);
    }
  }

  /** يبثّ موقع الكابتن على نقاط بينية من المطعم للعميل (~١٨ ثانية). */
  private async driveRoute(
    captainId: string,
    orderId: string,
    aLat: number,
    aLng: number,
    bLat: number,
    bLng: number,
  ) {
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      if (this.disposed) return;
      const t = i / steps;
      const lat = aLat + (bLat - aLat) * t;
      const lng = aLng + (bLng - aLng) * t;
      // للأدمن **وللعميل صاحب الطلب** — عشان شاشة التتبّع تتحرّك لحظياً.
      this.gateway.broadcastTripLocation(captainId, orderId, num(lat), num(lng));
      await this.sleep(1800);
    }
  }

  private haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
    const R = 6371;
    const dLat = ((bLat - aLat) * Math.PI) / 180;
    const dLng = ((bLng - aLng) * Math.PI) / 180;
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

function num(v: number): number {
  return Number(v.toFixed(6));
}
