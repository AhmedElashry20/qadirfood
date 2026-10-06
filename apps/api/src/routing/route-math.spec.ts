import { describe, expect, it } from 'vitest';

import {
  AVG_CITY_SPEED_KMH,
  DEFAULT_ROAD_FACTOR,
  durationMinutes,
  roadKmFromAir,
  routeCacheKey,
} from './route-math';

describe('roadKmFromAir', () => {
  it('بيزوّد المسافة الهوائية بمعامل الالتفاف', () => {
    expect(roadKmFromAir(10)).toBeCloseTo(13, 5);
    expect(roadKmFromAir(10, 1.4)).toBeCloseTo(14, 5);
  });

  it('نتيجته أطول من الهوائي دائماً — وهذا كل المقصود', () => {
    for (const km of [0.5, 3, 7.2, 25]) {
      expect(roadKmFromAir(km)).toBeGreaterThan(km);
    }
  });

  it('معامل أقل من ١ بيترفض — كان هيخلّي الطريق أقصر من الخط المستقيم', () => {
    expect(roadKmFromAir(10, 0.8)).toBeCloseTo(10 * DEFAULT_ROAD_FACTOR, 5);
  });

  it('المدخلات غير الصالحة تُرجع صفراً لا NaN', () => {
    expect(roadKmFromAir(Number.NaN)).toBe(0);
    expect(roadKmFromAir(-5)).toBe(0);
  });
});

describe('durationMinutes', () => {
  it('بيحسب الوقت من المسافة والسرعة', () => {
    expect(durationMinutes(25, 25)).toBe(60);
    expect(durationMinutes(12.5, 25)).toBe(30);
  });

  it('بيقرّب لأعلى — وعد بوقت أقصر أسوأ من وقت أطول', () => {
    expect(durationMinutes(1, 25)).toBe(3); // 2.4 دقيقة
  });

  it('مسافة صفر = وقت صفر، وسرعة غير صالحة بترجع للافتراضي', () => {
    expect(durationMinutes(0)).toBe(0);
    expect(durationMinutes(25, 0)).toBe(durationMinutes(25, AVG_CITY_SPEED_KMH));
  });
});

describe('routeCacheKey', () => {
  it('نقط متطابقة = نفس المفتاح', () => {
    const a = { lat: 24.7136, lng: 46.6753 };
    const b = { lat: 24.7743, lng: 46.7386 };
    expect(routeCacheKey(a, b)).toBe(routeCacheKey({ ...a }, { ...b }));
  });

  it('فرق أقل من ١١ متر بيشترك في نفس المفتاح — وإلا الكاش بلا فايدة', () => {
    const from = { lat: 24.7136, lng: 46.6753 };
    const to = { lat: 24.7743, lng: 46.7386 };
    const jittered = { lat: 24.71361, lng: 46.67532 };
    expect(routeCacheKey(jittered, to)).toBe(routeCacheKey(from, to));
  });

  it('الاتجاه يفرق — الذهاب والعودة ليسا المسار نفسه', () => {
    const a = { lat: 24.7136, lng: 46.6753 };
    const b = { lat: 24.7743, lng: 46.7386 };
    expect(routeCacheKey(a, b)).not.toBe(routeCacheKey(b, a));
  });
});
