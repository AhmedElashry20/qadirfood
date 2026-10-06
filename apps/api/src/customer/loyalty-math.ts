// نقاط الولاء — منطق نقي مختبَر. كل تحويل بين نقاط وريال بيمرّ من هنا، فأي
// غلط هنا بيغلط رصيد كل عميل.
//
// قرارات مبنية هنا:
//   • الكسب بيتقرّب **لتحت** — المنصة مابتوزّعش نقطة ماستحقتش.
//   • الاستبدال بيتقرّب **لتحت** كمان — ماناخدش من العميل نقاط أكتر من قيمة
//     الخصم اللي خده فعلاً.
//   • الخصم الكلي (كوبون + نقاط) مايزيدش عن المجموع — وإلا الوعاء الخاضع
//     للضريبة يبقى سالب والفاتورة كلها تنقلب.

import Decimal from 'decimal.js';

/** نقاط لكل ريال من مجموع الطلب — الافتراضي نقطة للريال. */
export const DEFAULT_POINTS_PER_SAR = 1;

/** قيمة النقطة بالريال — الافتراضي ٢٠ نقطة = ريال. */
export const DEFAULT_POINT_VALUE_SAR = 0.05;

/** أقل عدد نقاط قابل للاستبدال — استبدال ٣ نقاط مالوش معنى تشغيلي. */
export const MIN_REDEEM_POINTS = 100;

/**
 * النقاط المكتسبة من طلب.
 *
 * على **المجموع قبل الخصم** عن قصد: العميل اللي استخدم كوبون مايتعاقبش بنقاط
 * أقل، والنقاط مش مربوطة بالمبلغ المدفوع. بيتقرّب لتحت.
 */
export function pointsEarned(subtotal: Decimal.Value, pointsPerSar = DEFAULT_POINTS_PER_SAR): number {
  const value = new Decimal(subtotal);
  if (!value.isFinite() || value.lessThanOrEqualTo(0)) return 0;
  const rate = Number.isFinite(pointsPerSar) && pointsPerSar > 0 ? pointsPerSar : DEFAULT_POINTS_PER_SAR;
  return value.times(rate).floor().toNumber();
}

/** قيمة عدد نقاط بالريال. */
export function pointsToSar(points: number, pointValue = DEFAULT_POINT_VALUE_SAR): Decimal {
  if (!Number.isFinite(points) || points <= 0) return new Decimal(0);
  const rate = Number.isFinite(pointValue) && pointValue > 0 ? pointValue : DEFAULT_POINT_VALUE_SAR;
  return new Decimal(points).times(rate).toDecimalPlaces(2, Decimal.ROUND_DOWN);
}

/**
 * قد إيه نقاط ينفع تتستبدل فعلاً في طلب.
 *
 * بيتقيّد بتلاتة: رصيد العميل، والسقف اللي الطلب يستحمله بالريال، والحد الأدنى
 * للاستبدال. بيرجّع صفر لو النتيجة تحت الحد الأدنى — استبدال جزئي تحت الحد
 * بياكل نقاط العميل مقابل قروش.
 */
export function redeemablePoints(
  requested: number,
  available: number,
  maxDiscountSar: Decimal.Value,
  pointValue = DEFAULT_POINT_VALUE_SAR,
): number {
  if (!Number.isFinite(requested) || requested <= 0) return 0;
  if (!Number.isFinite(available) || available <= 0) return 0;

  const rate = Number.isFinite(pointValue) && pointValue > 0 ? pointValue : DEFAULT_POINT_VALUE_SAR;
  const cap = new Decimal(maxDiscountSar);
  if (!cap.isFinite() || cap.lessThanOrEqualTo(0)) return 0;

  // أقصى نقاط الطلب يستحملها = السقف بالريال ÷ قيمة النقطة، لتحت.
  const byAmount = cap.dividedBy(rate).floor().toNumber();
  const allowed = Math.min(Math.floor(requested), Math.floor(available), byAmount);

  return allowed < MIN_REDEEM_POINTS ? 0 : allowed;
}

/**
 * الخصم الكلي على الطلب بعد التقييد.
 *
 * السقف هو **المجموع**: من غيره، كوبون بمبلغ ثابت أكبر من السلة (أو نقاط كتير)
 * بيخلّي `subtotal − discount` سالب، فالضريبة تطلع سالبة والإجمالي يقلب لصالح
 * العميل. ده كان ممكن يحصل بالكوبون لوحده قبل النقاط.
 */
export function cappedDiscount(subtotal: Decimal.Value, discount: Decimal.Value): Decimal {
  const sub = new Decimal(subtotal);
  const disc = new Decimal(discount);
  if (disc.lessThanOrEqualTo(0)) return new Decimal(0);
  return Decimal.min(sub, disc);
}
