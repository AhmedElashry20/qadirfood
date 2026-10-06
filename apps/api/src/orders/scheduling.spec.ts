import { describe, expect, it } from 'vitest';

import {
  MAX_HORIZON_DAYS,
  MIN_LEAD_MINUTES,
  releaseAt,
  scheduleRejectionMessage,
  validateScheduleTime,
} from './scheduling';

const NOW = new Date('2026-03-10T12:00:00.000Z');
const minutesFromNow = (m: number) => new Date(NOW.getTime() + m * 60_000);

describe('validateScheduleTime', () => {
  it('بيقبل وقت بعد المهلة الدنيا', () => {
    expect(validateScheduleTime(minutesFromNow(MIN_LEAD_MINUTES), NOW)).toBeNull();
    expect(validateScheduleTime(minutesFromNow(180), NOW)).toBeNull();
  });

  it('بيرفض وقت أقرب من المهلة الدنيا', () => {
    expect(validateScheduleTime(minutesFromNow(MIN_LEAD_MINUTES - 1), NOW)).toBe('TOO_SOON');
    expect(validateScheduleTime(minutesFromNow(5), NOW)).toBe('TOO_SOON');
  });

  it('بيرفض وقت في الماضي — نفس رسالة «اختار وقت أبعد»', () => {
    expect(validateScheduleTime(minutesFromNow(-60), NOW)).toBe('TOO_SOON');
  });

  it('بيرفض أبعد من المدى الأقصى', () => {
    expect(validateScheduleTime(minutesFromNow(MAX_HORIZON_DAYS * 24 * 60 + 1), NOW)).toBe('TOO_FAR');
  });

  it('بيرفض تاريخ غير صالح بدل ما يمرّره', () => {
    expect(validateScheduleTime(new Date('حاجة غلط'), NOW)).toBe('INVALID');
  });
});

describe('releaseAt', () => {
  it('بيرجع لورا بمقدار التحضير + التوصيل', () => {
    const target = minutesFromNow(180);
    expect(releaseAt(target, 20, 15, NOW).toISOString()).toBe(
      new Date(target.getTime() - 35 * 60_000).toISOString(),
    );
  });

  it('مابيرجعش وقت في الماضي — يتطلق فوراً بدل ما يتعلّق', () => {
    const target = minutesFromNow(30);
    expect(releaseAt(target, 40, 20, NOW).toISOString()).toBe(NOW.toISOString());
  });

  it('الأرقام السالبة تُعامَل كصفر ولا تزيد الوقت', () => {
    const target = minutesFromNow(120);
    expect(releaseAt(target, -30, 0, NOW).toISOString()).toBe(target.toISOString());
  });
});

describe('scheduleRejectionMessage', () => {
  it('بيدي رسالة عربية فيها الحد نفسه', () => {
    expect(scheduleRejectionMessage('TOO_SOON')).toContain(String(MIN_LEAD_MINUTES));
    expect(scheduleRejectionMessage('TOO_FAR')).toContain(String(MAX_HORIZON_DAYS));
  });
});
