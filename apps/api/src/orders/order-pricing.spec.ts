import { describe, it, expect } from 'vitest';
import { computeOrderTotals } from './order-pricing';

// حساب فاتورة الطلب — الحسبة اللي كل طلب بيمرّ منها.
describe('حساب فاتورة الطلب', () => {
  it('طلب بسيط: مجموع ٥٠ + توصيل ١٠، ضريبة ١٥٪، عمولة ٢٠٪', () => {
    const r = computeOrderTotals({ subtotal: 50, discount: 0, deliveryFee: 10, vatPercent: 15, commissionRate: 20 });
    expect(r.taxable.toNumber()).toBe(60); // 50 + 10
    expect(r.vat.toNumber()).toBe(9); // 60 × 15%
    expect(r.total.toNumber()).toBe(69); // 60 + 9
    expect(r.commission.toNumber()).toBe(10); // 50 × 20% (على المجموع بس)
  });

  it('العمولة على المجموع فقط — لا على التوصيل', () => {
    // نفس المجموع، توصيل مختلف → نفس العمولة
    const a = computeOrderTotals({ subtotal: 100, discount: 0, deliveryFee: 5, vatPercent: 15, commissionRate: 20 });
    const b = computeOrderTotals({ subtotal: 100, discount: 0, deliveryFee: 25, vatPercent: 15, commissionRate: 20 });
    expect(a.commission.toNumber()).toBe(20);
    expect(b.commission.toNumber()).toBe(20); // التوصيل الأعلى ماغيّرش العمولة
    expect(b.total.toNumber()).toBeGreaterThan(a.total.toNumber()); // بس الإجمالي زاد
  });

  it('الخصم بيقلّل الوعاء الضريبي والإجمالي (بيتحسب قبل الضريبة)', () => {
    const r = computeOrderTotals({ subtotal: 100, discount: 20, deliveryFee: 10, vatPercent: 15, commissionRate: 10 });
    expect(r.taxable.toNumber()).toBe(90); // 100 − 20 + 10
    expect(r.vat.toNumber()).toBe(13.5); // 90 × 15%
    expect(r.total.toNumber()).toBe(103.5);
    expect(r.commission.toNumber()).toBe(10); // العمولة على المجموع الكامل ١٠٠ (مش بعد الخصم)
  });

  it('ضريبة صفر (لو VAT_PERCENT=0) → الإجمالي = الوعاء', () => {
    const r = computeOrderTotals({ subtotal: 40, discount: 0, deliveryFee: 8, vatPercent: 0, commissionRate: 15 });
    expect(r.vat.toNumber()).toBe(0);
    expect(r.total.toNumber()).toBe(48);
  });

  it('بيتعامل مع نصوص (زي ما بتيجي من Prisma Decimal)', () => {
    const r = computeOrderTotals({ subtotal: '59.90', discount: '0', deliveryFee: '13.00', vatPercent: '15', commissionRate: '20' });
    // الوعاء = 72.90 ؛ ضريبة = 10.935 ؛ إجمالي = 83.835
    expect(r.total.toFixed(3)).toBe('83.835');
    expect(r.commission.toFixed(2)).toBe('11.98'); // 59.90 × 20%
  });

  it('كسور الهللات تظل دقيقة (بلا floating-point drift)', () => {
    const r = computeOrderTotals({ subtotal: '33.33', discount: '0', deliveryFee: '11.11', vatPercent: '15', commissionRate: '17.5' });
    // (33.33 + 11.11) = 44.44 ؛ ضريبة = 6.666 ؛ إجمالي = 51.106
    expect(r.taxable.toFixed(2)).toBe('44.44');
    expect(r.total.toFixed(3)).toBe('51.106');
  });
});
