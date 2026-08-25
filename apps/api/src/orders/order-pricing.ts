// حساب فاتورة الطلب — دالة نقية مختبَرة. كل طلب بيمرّ من هنا، فأي غلط هنا بيغلط
// كل الأرقام (الإجمالي، الضريبة، عمولة المنصة). مفصولة عن جلب الأسعار من الداتابيز.
//
// قرارات مهمة مبنية هنا:
//   • الضريبة على (المجموع − الخصم + التوصيل) — يعني على قيمة الفاتورة بعد الخصم.
//   • عمولة المنصة على **المجموع بس** (مبيعات المطعم)، **مش** على رسوم التوصيل —
//     التوصيل مش دخل للمطعم فالمنصة ماتاخدش عمولة عليه.

import Decimal from 'decimal.js';

export interface OrderPricingInput {
  subtotal: Decimal.Value;
  discount: Decimal.Value;
  deliveryFee: Decimal.Value;
  /** نسبة مئوية، مثلاً 15. */
  vatPercent: Decimal.Value;
  /** نسبة عمولة المنصة على المطعم، مثلاً 20. */
  commissionRate: Decimal.Value;
}

export interface OrderPricingResult {
  taxable: Decimal;
  vat: Decimal;
  total: Decimal;
  commission: Decimal;
}

export function computeOrderTotals(input: OrderPricingInput): OrderPricingResult {
  const subtotal = new Decimal(input.subtotal);
  const discount = new Decimal(input.discount);
  const deliveryFee = new Decimal(input.deliveryFee);

  const taxable = subtotal.minus(discount).plus(deliveryFee);
  const vat = taxable.times(input.vatPercent).dividedBy(100);
  const total = taxable.plus(vat);
  // العمولة على المجموع بس — مش على التوصيل ولا الضريبة.
  const commission = subtotal.times(input.commissionRate).dividedBy(100);

  return { taxable, vat, total, commission };
}
