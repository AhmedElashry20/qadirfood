import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { LoyaltyEntryType, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { randomBytes } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.module';
import {
  DEFAULT_POINTS_PER_SAR,
  DEFAULT_POINT_VALUE_SAR,
  MIN_REDEEM_POINTS,
  pointsEarned,
  pointsToSar,
  redeemablePoints,
} from './loyalty-math';

/** حروف كود الإحالة — بدون 0/O/1/I/L عشان مايتلخبطوش وقت القراءة الصوتية. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 7;

/**
 * نقاط الولاء وبرنامج الإحالة.
 *
 * **الرصيد والدفتر لازم يتحركوا مع بعض دايماً**: `Customer.loyaltyPoints` هو
 * الرصيد و`loyalty_transactions` هو تفسيره. كل تعديل بيمرّ من `writeEntry`
 * اللي بتعمل الاتنين في معاملة واحدة — نفس الانضباط اللي في محفظة الكابتن.
 * الكتابة المباشرة على `loyaltyPoints` ممنوعة.
 */
@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  // ── الإعدادات ──

  /** مفعّل؟ مطفي = مافيش كسب ولا استبدال (الأرصدة الموجودة بتفضل زي ما هي). */
  async enabled(): Promise<boolean> {
    const v = String((await this.settings.get('LOYALTY_ENABLED')) ?? '').toLowerCase();
    return v === '1' || v === 'true';
  }

  async pointsPerSar(): Promise<number> {
    return this.num('LOYALTY_POINTS_PER_SAR', DEFAULT_POINTS_PER_SAR);
  }

  async pointValue(): Promise<number> {
    return this.num('LOYALTY_POINT_VALUE_SAR', DEFAULT_POINT_VALUE_SAR);
  }

  /** نقاط مكافأة الإحالة — للداعي وللمدعو (نفس القيمة للاتنين). */
  async referralPoints(): Promise<number> {
    return Math.floor(this.clampPositive(await this.num('LOYALTY_REFERRAL_POINTS', 500)));
  }

  private async num(key: string, fallback: number): Promise<number> {
    const raw = await this.settings.get(key);
    const n = Number(raw);
    return raw !== undefined && raw !== '' && Number.isFinite(n) && n > 0 ? n : fallback;
  }

  private clampPositive(n: number): number {
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  // ── القراءة ──

  /** الرصيد وقيمته بالريال وكشف الحركات. */
  async summary(customerId: string, limit = 50) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { loyaltyPoints: true },
    });
    if (!customer) throw new NotFoundException('حساب العميل غير موجود');

    const [entries, pointValue, perSar, enabled] = await Promise.all([
      this.prisma.loyaltyTransaction.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 200),
        include: { order: { select: { orderNumber: true } } },
      }),
      this.pointValue(),
      this.pointsPerSar(),
      this.enabled(),
    ]);

    return {
      enabled,
      points: customer.loyaltyPoints,
      valueSar: pointsToSar(customer.loyaltyPoints, pointValue).toNumber(),
      pointsPerSar: perSar,
      pointValueSar: pointValue,
      minRedeemPoints: MIN_REDEEM_POINTS,
      entries: entries.map((e) => ({
        id: e.id,
        type: e.type,
        points: e.points,
        balanceAfter: e.balanceAfter,
        descriptionAr: e.descriptionAr,
        orderNumber: e.order?.orderNumber ?? null,
        createdAt: e.createdAt,
      })),
    };
  }

  // ── الكتابة ──

  /**
   * سطر في الدفتر + تحديث الرصيد في معاملة واحدة.
   *
   * القيد الفريد `(orderId, customerId, type)` هو منع التكرار: تسليم بيتنادى
   * مرتين مايضاعفش النقاط. بنمسك تصادم القيد (`P2002`) ونرجّع السطر الموجود
   * بدل ما نرمي خطأ — الاستدعاء المتكرر سلوك متوقع مش غلط.
   *
   * `tx` اختياري: مرّره عشان النقاط تتحرك جوه معاملة الطلب — لو الطلب فشل،
   * النقاط ترجع معاه.
   */
  private async writeEntry(
    customerId: string,
    type: LoyaltyEntryType,
    points: number,
    descriptionAr: string,
    orderId: string | null,
    tx?: Prisma.TransactionClient,
  ) {
    if (points === 0) return null;

    const run = async (client: Prisma.TransactionClient) => {
      const customer = await client.customer.update({
        where: { id: customerId },
        data: { loyaltyPoints: { increment: points } },
        select: { loyaltyPoints: true },
      });

      // الرصيد مايقعش تحت الصفر: لو حصل، يبقى فيه غلط في الحساب فوق مش حالة
      // عادية — بنوقف بدل ما نسيب رصيد سالب يفضل يتراكم.
      if (customer.loyaltyPoints < 0) {
        throw new BadRequestException('رصيد النقاط غير كافٍ');
      }

      return client.loyaltyTransaction.create({
        data: {
          customerId,
          type,
          points,
          balanceAfter: customer.loyaltyPoints,
          descriptionAr,
          orderId,
        },
      });
    };

    // جوه معاملة المتصل: مانمسكش P2002. تصادم القيد بيلغي المعاملة كلها، فأي
    // استعلام بعده على نفس الاتصال بيفشل — ومحاولة «الرجوع للسطر الموجود»
    // بتبلع خطأ والمتصل يفتكر إن العملية نجحت. الاستبدال على طلب جديد مستحيل
    // يتصادم أصلاً، فالتصادم هنا معناه خلل حقيقي لازم يطلع.
    if (tx) return run(tx);

    try {
      return await this.prisma.$transaction(run);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // اتكتب قبل كده لنفس (الطلب + العميل + النوع) — استدعاء متكرر، مش غلط.
        return this.prisma.loyaltyTransaction.findFirst({
          where: { orderId, customerId, type },
        });
      }
      throw error;
    }
  }

  /**
   * كسب نقاط من طلب تم تسليمه.
   *
   * **مهم**: القيد الفريد بيمنع التكرار، بس `increment` بيشتغل قبل ما القيد
   * يتفحص — فلو اتنادت مرتين متزامنتين، الأولى بتنجح والتانية بتفشل بـ P2002
   * **بعد** ما زوّدت الرصيد. عشان كده الزيادة والسطر في نفس المعاملة: فشل
   * القيد بيرجّع الزيادة معاه.
   */
  async creditEarned(customerId: string, orderId: string, subtotal: Decimal.Value, orderNumber: string) {
    if (!(await this.enabled())) return null;

    const points = pointsEarned(subtotal, await this.pointsPerSar());
    if (points <= 0) return null;

    return this.writeEntry(
      customerId,
      LoyaltyEntryType.EARN,
      points,
      `نقاط من طلب ${orderNumber}`,
      orderId,
    );
  }

  /**
   * قد إيه نقاط العميل يقدر يستبدلها في طلب بالسقف المعطى — من غير ما يخصم.
   * الشاشة بتستخدمها لعرض الخصم قبل التأكيد.
   */
  async quoteRedemption(customerId: string, requestedPoints: number, maxDiscountSar: Decimal.Value) {
    if (!(await this.enabled())) return { points: 0, discountSar: new Decimal(0) };

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { loyaltyPoints: true },
    });
    if (!customer) throw new NotFoundException('حساب العميل غير موجود');

    const pointValue = await this.pointValue();
    const points = redeemablePoints(requestedPoints, customer.loyaltyPoints, maxDiscountSar, pointValue);
    return { points, discountSar: pointsToSar(points, pointValue) };
  }

  /**
   * خصم النقاط المستبدلة — **لازم تتنادى جوه معاملة الطلب**.
   *
   * لو اتنادت برّه، طلب فشل بعد الخصم بيسيب العميل خاسر نقاطه بلا طلب.
   */
  async debitRedemption(
    customerId: string,
    orderId: string,
    points: number,
    orderNumber: string,
    tx: Prisma.TransactionClient,
  ) {
    if (points <= 0) return null;
    return this.writeEntry(
      customerId,
      LoyaltyEntryType.REDEEM,
      -points,
      `استبدال نقاط على طلب ${orderNumber}`,
      orderId,
      tx,
    );
  }

  /**
   * رجوع نقاط الاستبدال لطلب اتلغى — العميل ماخدش الخصم فعلاً.
   *
   * سطر منفصل بنوع `REVERSAL` مش حذف سطر الاستبدال: الدفتر مابيتعدّلش بأثر
   * رجعي، كل حركة بتفضل ظاهرة.
   */
  async reverseRedemption(customerId: string, orderId: string, points: number, orderNumber: string) {
    if (points <= 0) return null;
    return this.writeEntry(
      customerId,
      LoyaltyEntryType.REVERSAL,
      points,
      `رجوع نقاط طلب ملغي ${orderNumber}`,
      orderId,
    );
  }

  // ── الإحالة ──

  /**
   * كود إحالة العميل — بيتولّد أول مرة يطلبه.
   *
   * التوليد بيعيد المحاولة على التصادم: الكود عشوائي و`@unique`، فتصادم نادر
   * لكنه ممكن، ومن غير إعادة المحاولة العميل بياخد خطأ ٥٠٠ بلا سبب واضح.
   */
  async myReferral(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { referralCode: true, referralRewarded: true, referredById: true },
    });
    if (!customer) throw new NotFoundException('حساب العميل غير موجود');

    let code = customer.referralCode;
    if (!code) code = await this.generateCode(customerId);

    const [invited, points] = await Promise.all([
      this.prisma.customer.count({ where: { referredById: customerId } }),
      this.referralPoints(),
    ]);

    return {
      code,
      invitedCount: invited,
      rewardPoints: points,
      /** استخدم كود غيره — فمايستحقش يستخدم كود تاني. */
      usedReferral: !!customer.referredById,
    };
  }

  private async generateCode(customerId: string): Promise<string> {
    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate = this.randomCode();
      try {
        const updated = await this.prisma.customer.update({
          where: { id: customerId },
          data: { referralCode: candidate },
          select: { referralCode: true },
        });
        return updated.referralCode!;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          continue; // الكود محجوز — جرّب تاني
        }
        throw error;
      }
    }
    throw new BadRequestException('تعذّر توليد رمز إحالة — حاول مرة أخرى');
  }

  private randomCode(): string {
    const bytes = randomBytes(CODE_LENGTH);
    let out = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
    return out;
  }

  /**
   * ربط عميل بكود إحالة.
   *
   * شروط مقصودة:
   *   · مايربطش نفسه بنفسه — أوضح طريقة للتلاعب.
   *   · مرة واحدة بس: لو مربوط خلاص، بيترفض.
   *   · **قبل أول طلب بس** — كود بعد أول طلب معناه إن العميل مش «مدعو» فعلاً.
   *
   * المكافأة مابتتصرفش هنا: بتتصرف بعد **أول طلب تم تسليمه** (`rewardReferral`)
   * عشان حساب وهمي مايحصدش نقاط بمجرد التسجيل.
   */
  async applyReferralCode(customerId: string, code: string) {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) throw new BadRequestException('رمز الإحالة مطلوب');

    const me = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { referredById: true, referralCode: true },
    });
    if (!me) throw new NotFoundException('حساب العميل غير موجود');
    if (me.referredById) throw new BadRequestException('استخدمت رمز إحالة بالفعل');
    if (me.referralCode?.toUpperCase() === trimmed) {
      throw new BadRequestException('لا يمكن استخدام رمزك الخاص');
    }

    const orders = await this.prisma.order.count({ where: { customerId } });
    if (orders > 0) {
      throw new BadRequestException('رمز الإحالة يُستخدم قبل أول طلب فقط');
    }

    const referrer = await this.prisma.customer.findUnique({
      where: { referralCode: trimmed },
      select: { id: true },
    });
    if (!referrer) throw new BadRequestException('رمز إحالة غير صحيح');
    if (referrer.id === customerId) throw new BadRequestException('لا يمكن استخدام رمزك الخاص');

    await this.prisma.customer.update({
      where: { id: customerId },
      data: { referredById: referrer.id },
    });

    return { linked: true, rewardPoints: await this.referralPoints() };
  }

  /**
   * صرف مكافأة الإحالة بعد أول طلب تم تسليمه — للداعي وللمدعو.
   *
   * `referralRewarded` علم يُكتب مرة واحدة: الشرط في `updateMany` بيخلّي
   * الصرف ذري، فتسليمين متزامنين لنفس العميل مايصرفوش المكافأة مرتين.
   */
  async rewardReferral(customerId: string, orderId: string, orderNumber: string) {
    if (!(await this.enabled())) return;

    const me = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { referredById: true, referralRewarded: true },
    });
    if (!me?.referredById || me.referralRewarded) return;

    // اقفل العلم الأول — اللي يكسب السباق هو اللي يصرف.
    const claimed = await this.prisma.customer.updateMany({
      where: { id: customerId, referralRewarded: false, referredById: { not: null } },
      data: { referralRewarded: true },
    });
    if (claimed.count === 0) return;

    const points = await this.referralPoints();
    if (points <= 0) return;

    await this.writeEntry(
      customerId,
      LoyaltyEntryType.REFERRAL,
      points,
      `مكافأة انضمام عبر دعوة — طلب ${orderNumber}`,
      orderId,
    );
    await this.writeEntry(
      me.referredById,
      LoyaltyEntryType.REFERRAL,
      points,
      'مكافأة دعوة صديق أتمّ أول طلب',
      orderId,
    );

    this.logger.log(`صُرفت مكافأة إحالة (${points} نقطة) للعميل ${customerId} وللداعي ${me.referredById}`);
  }
}
