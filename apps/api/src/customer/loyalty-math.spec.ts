import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_POINT_VALUE_SAR,
  MIN_REDEEM_POINTS,
  cappedDiscount,
  pointsEarned,
  pointsToSar,
  redeemablePoints,
} from './loyalty-math';

describe('pointsEarned', () => {
  it('نقطة لكل ريال افتراضياً، بتقريب لتحت', () => {
    expect(pointsEarned(100)).toBe(100);
    expect(pointsEarned('49.90')).toBe(49);
  });

  it('معدّل مخصّص', () => {
    expect(pointsEarned(100, 2)).toBe(200);
    expect(pointsEarned(100, 0.5)).toBe(50);
  });

  it('مجموع صفر أو سالب = صفر نقاط', () => {
    expect(pointsEarned(0)).toBe(0);
    expect(pointsEarned(-50)).toBe(0);
  });

  it('المعدّل غير الصالح يرجع للافتراضي لا NaN', () => {
    expect(pointsEarned(100, Number.NaN)).toBe(100);
    expect(pointsEarned(100, -1)).toBe(100);
  });
});

describe('pointsToSar', () => {
  it('٢٠ نقطة = ريال بالقيمة الافتراضية', () => {
    expect(pointsToSar(20).toNumber()).toBe(1);
    expect(pointsToSar(500).toNumber()).toBe(25);
  });

  it('بيقرّب لتحت — ماندّيش العميل قرش زيادة', () => {
    // ٧ نقاط × ٠.٠٥ = ٠.٣٥ بالظبط
    expect(pointsToSar(7).toNumber()).toBe(0.35);
    // ٣ نقاط × ٠.٠٣٣ = ٠.٠٩٩ → ٠.٠٩
    expect(pointsToSar(3, 0.033).toNumber()).toBe(0.09);
  });

  it('نقاط صفر أو سالبة = صفر', () => {
    expect(pointsToSar(0).toNumber()).toBe(0);
    expect(pointsToSar(-100).toNumber()).toBe(0);
  });
});

describe('redeemablePoints', () => {
  it('بيتقيّد برصيد العميل', () => {
    expect(redeemablePoints(1000, 300, 100)).toBe(300);
  });

  it('بيتقيّد بسقف الطلب بالريال', () => {
    // سقف ٥ ر.س ÷ ٠.٠٥ = ١٠٠ نقطة
    expect(redeemablePoints(1000, 1000, 5)).toBe(100);
  });

  it('أقل من الحد الأدنى = صفر، لا استبدال جزئي', () => {
    expect(redeemablePoints(50, 1000, 100)).toBe(0);
    expect(redeemablePoints(MIN_REDEEM_POINTS - 1, 1000, 100)).toBe(0);
    expect(redeemablePoints(MIN_REDEEM_POINTS, 1000, 100)).toBe(MIN_REDEEM_POINTS);
  });

  it('سقف صفر (طلب مخصوم بالكامل بكوبون) = لا استبدال', () => {
    expect(redeemablePoints(1000, 1000, 0)).toBe(0);
  });

  it('قيمة النقاط المستبدلة مابتزيدش عن السقف أبداً', () => {
    for (const cap of [1, 3.7, 12.5, 99]) {
      const points = redeemablePoints(100000, 100000, cap);
      expect(pointsToSar(points).toNumber()).toBeLessThanOrEqual(cap);
    }
  });

  it('طلب سالب أو رصيد فارغ = صفر', () => {
    expect(redeemablePoints(-5, 1000, 100)).toBe(0);
    expect(redeemablePoints(500, 0, 100)).toBe(0);
  });
});

describe('cappedDiscount', () => {
  it('الخصم أقل من المجموع بيمرّ زي ما هو', () => {
    expect(cappedDiscount(100, 30).toNumber()).toBe(30);
  });

  it('خصم أكبر من المجموع بيتقيّد بالمجموع — الوعاء الخاضع للضريبة مايبقاش سالب', () => {
    expect(cappedDiscount(100, 250).toNumber()).toBe(100);
    expect(new Decimal(100).minus(cappedDiscount(100, 250)).toNumber()).toBe(0);
  });

  it('خصم سالب = صفر', () => {
    expect(cappedDiscount(100, -10).toNumber()).toBe(0);
  });

  it('القيمة الافتراضية للنقطة ثابتة — تغييرها يغيّر رصيد كل عميل', () => {
    expect(DEFAULT_POINT_VALUE_SAR).toBe(0.05);
  });
});
