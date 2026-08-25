// منطق «أي منطقة بتغطّي النقطة دي» — نقي ومختبَر. المنطقة مستطيل (حدود min/max)،
// والنقطة جوّاها لو كانت ضمن الحدود على المحورين. عند التداخل: الأعلى أولوية
// يكسب، وعند التعادل ترتيب ثابت بالـ id عشان النتيجة متبقاش عشوائية بين استدعاءين.

export interface ZoneBox {
  id: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  priority: number;
  isActive: boolean;
}

export function pointInZone(z: ZoneBox, lat: number, lng: number): boolean {
  return lat >= z.minLat && lat <= z.maxLat && lng >= z.minLng && lng <= z.maxLng;
}

/**
 * المنطقة المفعّلة اللي بتغطّي النقطة (الأعلى أولوية، وأصغر id عند التعادل)،
 * أو `null` لو مافيش منطقة. نفس الترتيب اللي استعلام قاعدة البيانات بيعمله.
 */
export function resolveZone<T extends ZoneBox>(zones: T[], lat: number, lng: number): T | null {
  const covering = zones.filter((z) => z.isActive && pointInZone(z, lat, lng));
  if (!covering.length) return null;
  covering.sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return covering[0];
}
