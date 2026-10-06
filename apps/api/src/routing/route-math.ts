/**
 * حساب المسافة والوقت — منطق نقي، مافيهوش شبكة ولا داتابيز، فبيتختبر مباشرة.
 * `RoutingService` بتستخدمه وبتضيف عليه الكاش والمزوّد والرجوع الآمن.
 */

/** متوسط سرعة الكابتن في المدينة (كم/س) — لتقدير الوقت من المسافة. */
export const AVG_CITY_SPEED_KMH = 25;

/**
 * معامل التفاف الطريق — الخط الهوائي دايماً أقصر من الطريق الفعلي.
 * ١.٣ متعارف عليه للمدن ذات الشبكة المنتظمة (الرياض/جدة ١.٣–١.٤).
 */
export const DEFAULT_ROAD_FACTOR = 1.3;

/**
 * تقدير مسافة الطريق من المسافة الهوائية.
 *
 * من غير المعامل، مستحق الكابتن كان بيتحسب على مسافة **أقصر من الحقيقة دايماً**
 * — بخس منهجي في كل رحلة، مش خطأ عشوائي بيتوازن على المدى الطويل.
 */
export function roadKmFromAir(airKm: number, factor: number = DEFAULT_ROAD_FACTOR): number {
  if (!Number.isFinite(airKm) || airKm < 0) return 0;
  const f = Number.isFinite(factor) && factor >= 1 ? factor : DEFAULT_ROAD_FACTOR;
  return airKm * f;
}

/** وقت الرحلة بالدقايق — بيتقرّب لأعلى، ساعة وصول متأخرة أرحم من وعد مكسور. */
export function durationMinutes(distanceKm: number, speedKmh: number = AVG_CITY_SPEED_KMH): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  const v = Number.isFinite(speedKmh) && speedKmh > 0 ? speedKmh : AVG_CITY_SPEED_KMH;
  return Math.ceil((distanceKm / v) * 60);
}

/**
 * مفتاح كاش المسار.
 *
 * ٤ خانات عشرية ≈ ١١ متر: أدق من كده يخلّي الكاش بلا فايدة (كل GPS ping مفتاح
 * جديد)، وأقل يخلط عناوين مختلفة في نفس المبنى.
 */
export function routeCacheKey(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): string {
  const r = (n: number) => n.toFixed(4);
  return `route:${r(from.lat)},${r(from.lng)}:${r(to.lat)},${r(to.lng)}`;
}
