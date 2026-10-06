/**
 * قواعد الطلب المجدول — منطق نقي، بيتختبر من غير داتابيز ولا وقت حقيقي
 * (`now` بيتمرّر، مابيتقرأش من الساعة).
 */

/**
 * أقل مهلة قبل وقت التسليم المطلوب.
 *
 * طلب مجدول بعد ٥ دقايق مالوش معنى: المطعم لازم يحضّر والكابتن لازم يوصل.
 * أقل من كده يخلّيه طلب فوري متأخر، والعميل يستنى ويلوم الجدولة.
 */
export const MIN_LEAD_MINUTES = 30;

/** أقصى مدى للجدولة — أبعد من كده الأسعار والتوفّر مابيبقاش لهم معنى. */
export const MAX_HORIZON_DAYS = 7;

export type ScheduleRejection = 'INVALID' | 'TOO_SOON' | 'TOO_FAR';

/**
 * بيتأكد إن وقت الجدولة معقول. بيرجّع `null` لو سليم، وإلا سبب الرفض.
 *
 * الوقت اللي فات بيترفض كـ `TOO_SOON` مش كحالة منفصلة — من ناحية العميل
 * الاتنين نفس الحاجة: «اختار وقت أبعد».
 */
export function validateScheduleTime(scheduledFor: Date, now: Date): ScheduleRejection | null {
  const at = scheduledFor.getTime();
  if (!Number.isFinite(at)) return 'INVALID';

  const leadMinutes = (at - now.getTime()) / 60_000;
  if (leadMinutes < MIN_LEAD_MINUTES) return 'TOO_SOON';
  if (leadMinutes > MAX_HORIZON_DAYS * 24 * 60) return 'TOO_FAR';
  return null;
}

/**
 * وقت إطلاق الطلب للمطعم.
 *
 * بنرجع لورا من وقت التسليم المطلوب بمقدار (التحضير + التوصيل) عشان الطلب
 * يوصل العميل في الوقت اللي طلبه — لا قبله فيبرد، ولا بعده.
 *
 * بنقيّده بـ `now` كحد أدنى: لو الحساب طلع وقت فات (جدولة على حدود المهلة
 * الدنيا)، الطلب يتطلق فوراً بدل ما يتعلّق في الماضي وماحدّش يطلقه.
 */
export function releaseAt(
  scheduledFor: Date,
  prepMinutes: number,
  travelMinutes: number,
  now: Date,
): Date {
  const lead = Math.max(0, prepMinutes) + Math.max(0, travelMinutes);
  const at = new Date(scheduledFor.getTime() - lead * 60_000);
  return at.getTime() < now.getTime() ? new Date(now.getTime()) : at;
}

/** رسالة عربية جاهزة للعرض لكل سبب رفض. */
export function scheduleRejectionMessage(reason: ScheduleRejection): string {
  switch (reason) {
    case 'TOO_SOON':
      return `أقل وقت للجدولة بعد ${MIN_LEAD_MINUTES} دقيقة من الآن`;
    case 'TOO_FAR':
      return `لا يمكن الجدولة لأكثر من ${MAX_HORIZON_DAYS} أيام`;
    default:
      return 'وقت الجدولة غير صالح';
  }
}
