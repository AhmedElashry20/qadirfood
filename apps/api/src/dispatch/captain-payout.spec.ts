import { describe, it, expect } from 'vitest';
import { payoutForDistance, MIN_CAPTAIN_PAYOUT, PAYOUT_PER_KM } from './captain-payout';

// مستحق الكابتن = الأكبر بين الحد الأدنى (٨) ومقابل المسافة (١.٥/كم).
describe('مستحق الكابتن', () => {
  it('رحلة قصيرة جداً → الحد الأدنى (٨)', () => {
    expect(payoutForDistance(0).toNumber()).toBe(MIN_CAPTAIN_PAYOUT);
    expect(payoutForDistance(2).toNumber()).toBe(8); // 2×1.5=3 < 8 → 8
  });

  it('عند نقطة التعادل (~٥.٣٣ كم) بيبدأ يتخطّى الحد الأدنى', () => {
    // 5.33 × 1.5 = 7.995 < 8 → 8 ؛ 5.34 × 1.5 = 8.01 > 8
    expect(payoutForDistance(5.33).toNumber()).toBe(8);
    expect(payoutForDistance(5.34).toNumber()).toBe(8.01);
  });

  it('رحلة طويلة → المسافة × ١.٥', () => {
    expect(payoutForDistance(10).toNumber()).toBe(15); // 10×1.5
    expect(payoutForDistance(20).toNumber()).toBe(30);
  });

  it('بيقرّب لمنزلتين', () => {
    const r = payoutForDistance(7.777);
    expect(r.decimalPlaces()).toBeLessThanOrEqual(2);
    expect(r.toNumber()).toBe(11.67); // 7.777×1.5=11.6655 → 11.67
  });

  it('الثوابت زي المتوقع', () => {
    expect(MIN_CAPTAIN_PAYOUT).toBe(8);
    expect(PAYOUT_PER_KM).toBe(1.5);
  });
});
