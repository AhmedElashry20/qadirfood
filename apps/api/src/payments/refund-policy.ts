// سياسة العمولة على الاسترداد — **العمولة تتبع المسؤولية، مش المبلغ**.
//
// دي نقطة القرار الوحيدة في المسار: لو السياسة التجارية اتغيّرت، بتتعدّل هنا بس
// والباقي كله مبني على قيمتها. مفصولة في دالة نقية عشان تتّختبر من غير قاعدة
// بيانات ولا خدمات.
//
//   NONE       — اتلغى قبل ما حاجة تحصل → ترجع العمولة بالتناسب (مافيش بيع)
//   RESTAURANT — غلطة المطعم → ترجع بالتناسب (المنصة ماتكسبش على بيع اترد)
//   PLATFORM   — غلطة المنصة/استرضاء → ماترجعش (المطعم سلّم شغله صح)
//   CAPTAIN    — الطلب ضاع/اتأخر → ماترجعش (تحمّل الكابتن)

import Decimal from 'decimal.js';
import { RefundLiability } from '@prisma/client';

export interface RefundOrderAmounts {
  total: Decimal.Value;
  commission: Decimal.Value;
}

/**
 * قد إيه من العمولة يترجّع لاسترداد بمبلغ `refundAmount` وجهة تحمّل `liability`.
 * الاسترداد الجزئي بيرجّع الجزء المتناسب من العمولة بس.
 */
export function commissionToReverse(
  order: RefundOrderAmounts,
  refundAmount: Decimal.Value,
  liability: RefundLiability,
): Decimal {
  const reverses = liability === RefundLiability.NONE || liability === RefundLiability.RESTAURANT;
  if (!reverses) return new Decimal(0);

  const total = new Decimal(order.total);
  if (total.lte(0)) return new Decimal(0);

  const share = new Decimal(refundAmount).dividedBy(total);
  return new Decimal(order.commission).times(share).toDecimalPlaces(2);
}
