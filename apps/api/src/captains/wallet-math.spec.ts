import { describe, it, expect } from 'vitest';
import { availableToWithdraw, withdrawalRejection, MIN_WITHDRAWAL } from './wallet-math';

// محفظة الكابتن — المتاح للسحب بيحجز السحوبات المعلّقة، والسحب له حد أدنى وسقف.
describe('محفظة الكابتن — المتاح للسحب', () => {
  it('مافيش معلّق → المتاح = الرصيد', () => {
    expect(availableToWithdraw(200, 0)).toBe(200);
  });

  it('السحب المعلّق محجوز (مايتطلبش مرتين)', () => {
    expect(availableToWithdraw(200, 120)).toBe(80); // 200 − 120
  });

  it('معلّق أكبر من الرصيد → صفر (مش سالب)', () => {
    expect(availableToWithdraw(50, 80)).toBe(0);
  });
});

describe('محفظة الكابتن — أهلية السحب', () => {
  it('أقل من الحد الأدنى → مرفوض', () => {
    expect(withdrawalRejection(30, 500)).toContain('الحد الأدنى');
  });

  it('أكبر من المتاح → مرفوض', () => {
    expect(withdrawalRejection(100, 80)).toContain('الرصيد المتاح');
  });

  it('ضمن الحدود → مقبول (null)', () => {
    expect(withdrawalRejection(50, 80)).toBeNull();
    expect(withdrawalRejection(80, 80)).toBeNull(); // مساوي للمتاح بالظبط
  });

  it('السيناريو الحقيقي: رصيد ٢٠٠ معلّق ١٢٠ → متاح ٨٠، طلب ١٠٠ يترفض', () => {
    const available = availableToWithdraw(200, 120);
    expect(available).toBe(80);
    expect(withdrawalRejection(100, available)).toContain('الرصيد المتاح');
    expect(withdrawalRejection(70, available)).toBeNull();
  });

  it('الحد الأدنى = ٥٠', () => {
    expect(MIN_WITHDRAWAL).toBe(50);
    expect(withdrawalRejection(49.99, 1000)).toContain('الحد الأدنى');
  });
});
