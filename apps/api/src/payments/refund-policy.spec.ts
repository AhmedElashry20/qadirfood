import { describe, it, expect } from 'vitest';
import { RefundLiability } from '@prisma/client';
import { commissionToReverse } from './refund-policy';

// سياسة العمولة على الاسترداد — «العمولة تتبع المسؤولية». طلب ١٠٠ إجمالي بعمولة
// ٢٠ (٢٠٪). الاسترداد الجزئي بيرجّع الجزء المتناسب من العمولة بس.
const order = { total: 100, commission: 20 };

describe('سياسة العمولة على الاسترداد', () => {
  it('NONE (اتلغى قبل البيع): استرداد كامل → ترجع كل العمولة', () => {
    expect(commissionToReverse(order, 100, RefundLiability.NONE).toNumber()).toBe(20);
  });

  it('RESTAURANT (غلطة المطعم): استرداد جزئي ٥٠ → ترجع نص العمولة (١٠)', () => {
    expect(commissionToReverse(order, 50, RefundLiability.RESTAURANT).toNumber()).toBe(10);
  });

  it('PLATFORM (غلطة المنصة): ماترجعش عمولة — المطعم سلّم صح', () => {
    expect(commissionToReverse(order, 100, RefundLiability.PLATFORM).toNumber()).toBe(0);
  });

  it('CAPTAIN (تحمّل الكابتن): ماترجعش عمولة', () => {
    expect(commissionToReverse(order, 100, RefundLiability.CAPTAIN).toNumber()).toBe(0);
  });

  it('استرداد ربع المبلغ (٢٥) بتحمّل RESTAURANT → ربع العمولة (٥)', () => {
    expect(commissionToReverse(order, 25, RefundLiability.RESTAURANT).toNumber()).toBe(5);
  });

  it('طلب بإجمالي صفر → صفر عمولة (حماية من القسمة على صفر)', () => {
    expect(commissionToReverse({ total: 0, commission: 0 }, 10, RefundLiability.NONE).toNumber()).toBe(0);
  });

  it('بيقرّب لمنزلتين: إجمالي ٩٠ عمولة ١٠ استرداد ٣٣.٣٣ → ٣.٧ تقريباً', () => {
    const r = commissionToReverse({ total: 90, commission: 10 }, 33.33, RefundLiability.RESTAURANT);
    expect(r.toNumber()).toBeCloseTo(3.7, 1);
    // منزلتين بالظبط
    expect(r.decimalPlaces()).toBeLessThanOrEqual(2);
  });
});

describe('سقف نسبة العمولة المرتجعة', () => {
  it('استرداد أكبر من إجمالي الطلب (لأن المدفوع يشمل إكرامية) مايرجّعش عمولة أكبر من الأصل', () => {
    const order = { total: '100', commission: '20' };
    // العميل دفع ١٢٠ (١٠٠ فاتورة + ٢٠ إكرامية) واترد له الكل.
    const reversed = commissionToReverse(order, '120', RefundLiability.NONE);
    expect(reversed.toNumber()).toBe(20);
  });

  it('الاسترداد الكامل بالظبط بيرجّع العمولة كلها', () => {
    const order = { total: '100', commission: '20' };
    expect(commissionToReverse(order, '100', RefundLiability.NONE).toNumber()).toBe(20);
  });
});
