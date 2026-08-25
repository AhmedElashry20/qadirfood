// مستحق الكابتن على الرحلة — دالة نقية مختبَرة. حد أدنى مضمون + مقابل كل كيلومتر،
// عشان الرحلة القصيرة تفضل مجزية والرحلة الطويلة تتعوّض بالمسافة.

import Decimal from 'decimal.js';

/** حد أدنى لمستحق الكابتن مهما كانت المسافة قصيرة. */
export const MIN_CAPTAIN_PAYOUT = 8;
/** مقابل كل كيلومتر. */
export const PAYOUT_PER_KM = 1.5;

/** مستحق الكابتن لمسافة `distanceKm` — الأكبر بين الحد الأدنى ومقابل المسافة. */
export function payoutForDistance(distanceKm: number): Decimal {
  return Decimal.max(
    new Decimal(MIN_CAPTAIN_PAYOUT),
    new Decimal(distanceKm).times(PAYOUT_PER_KM),
  ).toDecimalPlaces(2);
}
