// حساب محفظة الكابتن — دوال نقية مختبَرة. أهم قاعدة: **المبلغ المتاح للسحب =
// الرصيد ناقص السحوبات المعلّقة** — عشان الكابتن مايقدرش يطلب نفس الرصيد مرتين
// (طلب معلّق بيحجز قيمته لحد ما يتعتمد أو يترفض).

/** الحد الأدنى للسحب. */
export const MIN_WITHDRAWAL = 50;

/** المتاح للسحب = الرصيد − المعلّق (مش أقل من صفر). */
export function availableToWithdraw(balance: number, pendingWithdrawals: number): number {
  return Math.max(balance - pendingWithdrawals, 0);
}

/**
 * سبب رفض طلب السحب (أو `null` لو مقبول): أقل من الحد الأدنى، أو أكبر من المتاح.
 */
export function withdrawalRejection(amount: number, available: number): string | null {
  if (amount < MIN_WITHDRAWAL) return `الحد الأدنى للسحب ${MIN_WITHDRAWAL} ر.س`;
  if (amount > available) return 'الرصيد المتاح أقل من المبلغ المطلوب';
  return null;
}
