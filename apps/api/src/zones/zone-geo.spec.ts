import { describe, it, expect } from 'vitest';
import { pointInZone, resolveZone, type ZoneBox } from './zone-geo';

// تسعير المناطق — أي منطقة بتغطّي عنوان العميل (وبالتالي رسوم توصيله).
const olaya: ZoneBox = { id: 'a', minLat: 24.712, maxLat: 24.735, minLng: 46.665, maxLng: 46.7, priority: 3, isActive: true };
const malaz: ZoneBox = { id: 'b', minLat: 24.715, maxLat: 24.76, minLng: 46.64, maxLng: 46.668, priority: 3, isActive: true };
const bigRiyadh: ZoneBox = { id: 'z', minLat: 24.55, maxLat: 24.9, minLng: 46.5, maxLng: 46.85, priority: 1, isActive: true };
const zones = [olaya, malaz, bigRiyadh];

describe('حلّ منطقة التوصيل', () => {
  it('نقطة العليا بترجع منطقة العليا (أولوية أعلى من العامة)', () => {
    expect(resolveZone(zones, 24.718, 46.679)?.id).toBe('a');
  });

  it('نقطة برّه كل المناطق المحدّدة → المنطقة العامة (fallback)', () => {
    expect(resolveZone(zones, 24.6, 46.8)?.id).toBe('z');
  });

  it('نقطة برّه كل المناطق خالص → null', () => {
    expect(resolveZone(zones, 25.5, 47.9)).toBeNull();
  });

  it('التداخل بيتحسم بالأولوية الأعلى', () => {
    // نقطة جوّه العامة (أولوية ١) والملز (أولوية ٣) → الملز
    const p = resolveZone(zones, 24.73, 46.66);
    expect(p?.id).toBe('b');
    expect(p?.priority).toBe(3);
  });

  it('عند تعادل الأولوية: ترتيب ثابت بالـ id (مش عشوائي)', () => {
    const dupA: ZoneBox = { ...olaya, id: 'm' };
    const dupB: ZoneBox = { ...olaya, id: 'x' };
    const r1 = resolveZone([dupB, dupA], 24.718, 46.679);
    const r2 = resolveZone([dupA, dupB], 24.718, 46.679);
    expect(r1?.id).toBe('m'); // أصغر id
    expect(r1?.id).toBe(r2?.id); // نفس النتيجة بغضّ النظر عن الترتيب الداخل
  });

  it('المنطقة المعطّلة بتتجاهل حتى لو بتغطّي النقطة', () => {
    const inactive = [{ ...olaya, isActive: false }, bigRiyadh];
    expect(resolveZone(inactive, 24.718, 46.679)?.id).toBe('z');
  });

  it('pointInZone: الحدود شاملة (نقطة على الحافّة جوّه)', () => {
    expect(pointInZone(olaya, 24.712, 46.665)).toBe(true);
    expect(pointInZone(olaya, 24.7119, 46.665)).toBe(false);
  });
});
