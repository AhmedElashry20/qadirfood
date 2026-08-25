import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { computeSettlement, type SettlementOrderInput, type SettlementRefundInput } from './settlement-math';

// إيراد المطعم = subtotal − discount. الاختبارات القديمة بتمرّر «الأكل» كـ subtotal
// وخصم صفر — فالأرقام المتوقعة ثابتة، والدلالة بقت «إيراد الأكل» مش «الإجمالي».
const order = (
  id: string,
  subtotal: number,
  commission: number,
  discount = 0,
): SettlementOrderInput => ({
  id,
  orderNumber: id,
  subtotal,
  discount,
  commission,
});
// افتراضياً orderTotal == orderFoodRevenue == amount (طلب أكل بحت من غير توصيل/
// ضريبة) عشان أرقام الاختبارات القديمة تفضل ثابتة (حصة الأكل = المبلغ كامل).
const refund = (
  id: string,
  amount: number,
  reversed: number,
  orderTotal?: number,
  orderFoodRevenue?: number,
): SettlementRefundInput => ({
  id,
  amount,
  commissionReversed: reversed,
  orderTotal: orderTotal ?? amount,
  orderFoodRevenue: orderFoodRevenue ?? orderTotal ?? amount,
  orderNumber: 'O',
  reasonAr: 'سبب',
});

// مجموع أمانت السطور — الثابت اللي لازم يساوي netPayout دايماً.
const sumLines = (lines: { amount: string }[]) =>
  lines.reduce((s, l) => s.plus(new Decimal(l.amount)), new Decimal(0));

describe('حساب تسوية المطعم', () => {
  it('الثابت الأساسي: netPayout = مجموع أمانت السطور بالظبط', () => {
    const r = computeSettlement(
      [order('A', 100, 20), order('B', 60, 12)],
      [refund('R1', 30, 6)],
    );
    expect(sumLines(r.lines).toFixed(2)).toBe(r.netPayout.toFixed(2));
  });

  it('سطر الطلب = إيراد الأكل − العمولة', () => {
    const r = computeSettlement([order('A', 100, 20)], []);
    expect(r.lines[0].amount).toBe('80.00'); // 100 − 20
    expect(r.netPayout.toFixed(2)).toBe('80.00');
  });

  it('الخصم بيتخصم من إيراد الأكل قبل العمولة', () => {
    // أكل ١٠٠، خصم ١٠ ⇒ إيراد ٩٠، عمولة ١٨ ⇒ صافي ٧٢. (التوصيل والضريبة
    // مش داخلين خالص في مدخلات المطعم — فمستحيل يتدفعوله بالغلط.)
    const r = computeSettlement([order('A', 100, 18, 10)], []);
    expect(r.grossSales.toFixed(2)).toBe('90.00');
    expect(r.lines[0].amount).toBe('72.00');
    expect(r.netPayout.toFixed(2)).toBe('72.00');
  });

  it('سطر الاسترداد سالب = العمولة المرجّعة − المبلغ', () => {
    const r = computeSettlement([order('A', 100, 20)], [refund('R1', 30, 6)]);
    const refundLine = r.lines.find((l) => l.refundId === 'R1')!;
    expect(refundLine.amount).toBe('-24.00'); // 6 − 30
    // netPayout = 80 (طلب) − 24 (استرداد) = 56
    expect(r.netPayout.toFixed(2)).toBe('56.00');
  });

  it('الاسترداد بيقلّل صافي المطعم بمقدار (المبلغ − العمولة المرجّعة)', () => {
    const without = computeSettlement([order('A', 100, 20)], []);
    const withR = computeSettlement([order('A', 100, 20)], [refund('R1', 30, 6)]);
    const drop = without.netPayout.minus(withR.netPayout);
    expect(drop.toFixed(2)).toBe('24.00'); // 30 − 6
  });

  it('استرداد كامل لطلب مسلّم بيرجّع المطعم لصفر (الأكل بس — من غير توصيل/ضريبة)', () => {
    // أكل ١٠٠ (عمولة ٢٠) + توصيل ١٥ + ضريبة ١٥٪ ⇒ total=132.25. استرداد كامل.
    const r = computeSettlement(
      [order('A', 100, 20)], // مبيعات المطعم = 100 − 20 = 80
      [refund('R1', 132.25, 20, 132.25, 100)],
    );
    const refundLine = r.lines.find((l) => l.refundId === 'R1')!;
    // حصة الأكل من الاسترداد = 132.25 × 100/132.25 = 100 ⇒ السطر = 20 − 100 = −80
    expect(refundLine.amount).toBe('-80.00');
    // المطعم رجع لصفر بالظبط: 80 − 80 = 0 (ماتحمّلش التوصيل ولا الضريبة).
    expect(r.netPayout.toFixed(2)).toBe('0.00');
    expect(sumLines(r.lines).toFixed(2)).toBe('0.00');
  });

  it('المجاميع بتتّجمع صح عبر عدة طلبات واستردادات', () => {
    const r = computeSettlement(
      [order('A', 100, 20), order('B', 50, 10), order('C', 40, 8)],
      [refund('R1', 25, 5), refund('R2', 10, 2)],
    );
    expect(r.grossSales.toFixed(2)).toBe('190.00'); // 100+50+40
    expect(r.commission.toFixed(2)).toBe('38.00'); // 20+10+8
    expect(r.refundsBorne.toFixed(2)).toBe('35.00'); // 25+10
    expect(r.commissionReversed.toFixed(2)).toBe('7.00'); // 5+2
    // net = 190 − 38 − 35 + 7 = 124
    expect(r.netPayout.toFixed(2)).toBe('124.00');
    expect(sumLines(r.lines).toFixed(2)).toBe('124.00'); // الثابت
    expect(r.lines).toHaveLength(5);
  });

  it('دورة فاضية = صفر (مافيش سطور)', () => {
    const r = computeSettlement([], []);
    expect(r.netPayout.toFixed(2)).toBe('0.00');
    expect(r.lines).toHaveLength(0);
  });

  it('الثابت صامد مع كسور القروش', () => {
    const r = computeSettlement(
      [order('A', 33.33, 6.67), order('B', 19.99, 4)],
      [refund('R1', 7.77, 1.55)],
    );
    expect(sumLines(r.lines).toFixed(2)).toBe(r.netPayout.toFixed(2));
  });
});
