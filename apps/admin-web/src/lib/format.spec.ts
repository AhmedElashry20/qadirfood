import { describe, it, expect } from 'vitest';
import { num, money, sar, pct, dateTime, dateOnly, timeOnly, relativeAr, untilAr, durationAr, ltr, DASH } from './format';

// دوال العرض — بتتعرض لكل رقم فلوس/تاريخ في اللوحة. غلطة هنا = رقم غلط قدام المستخدم.

const LRI = '⁦';
const PDI = '⁩';
const strip = (s: string) => s.replaceAll(LRI, '').replaceAll(PDI, ''); // نشيل عوازل الاتجاه للمقارنة

describe('تنسيق الأرقام والمبالغ', () => {
  it('num: فواصل آلاف من غير كسور', () => {
    expect(num(1234567)).toBe('1,234,567');
    expect(num(1234.9)).toBe('1,235'); // بيقرّب لصحيح
  });

  it('money: منزلتان عشريتان فقط عند وجود كسور فعلية', () => {
    expect(money(60)).toBe('60'); // صحيح → من غير كسور
    expect(money(59.9)).toBe('59.90'); // كسر → منزلتين
    expect(money(1234.5)).toBe('1,234.50');
  });

  it('sar: مبلغ + «ر.س» والرقم معزول اتجاهياً', () => {
    expect(strip(sar(1234.5))).toBe('1,234.50 ر.س');
    expect(sar(1234.5).startsWith(LRI)).toBe(true); // فيه عازل اتجاه
  });

  it('pct: نسبة مئوية بكسر لو موجود', () => {
    expect(pct(12.5)).toBe('12.5%');
    expect(pct(40)).toBe('40%'); // صحيح → من غير كسور
    expect(pct(14.29, 1)).toBe('14.3%'); // بيقرّب لخانة
  });

  it('كل الدوال بترجّع DASH للقيمة الفاضية/غير الصالحة', () => {
    for (const f of [num, money, sar, pct]) {
      expect(f(null)).toBe(DASH);
      expect(f(undefined)).toBe(DASH);
      expect(f('' as unknown as number)).toBe(DASH);
      expect(f('نص' as unknown as number)).toBe(DASH);
    }
  });

  it('money بيقبل نصوص (زي ما بتيجي من الـ API)', () => {
    expect(money('83.94')).toBe('83.94');
    expect(money('100')).toBe('100');
  });

  it('ltr: بيلفّ القيمة في عازلين اتجاه', () => {
    expect(ltr(5)).toBe(`${LRI}5${PDI}`);
  });
});

describe('تنسيق التواريخ (ثابت لا locale)', () => {
  const d = new Date(2026, 6, 20, 14, 35, 8); // 20 يوليو 2026، 14:35
  it('dateTime / dateOnly / timeOnly', () => {
    expect(dateTime(d)).toBe('2026-07-20 14:35');
    expect(dateOnly(d)).toBe('2026-07-20');
    expect(timeOnly(d)).toBe('14:35');
  });
  it('DASH للتاريخ الفاضي/الغلط', () => {
    expect(dateTime(null)).toBe(DASH);
    expect(dateOnly('ليس تاريخاً')).toBe(DASH);
  });
});

describe('الوقت النسبي والجمع العربي', () => {
  const ago = (ms: number) => new Date(Date.now() - ms);
  it('«الآن» لأقل من ٤٥ ثانية', () => {
    expect(relativeAr(ago(10_000))).toBe('الآن');
    expect(relativeAr(new Date(Date.now() + 5000))).toBe('الآن'); // مستقبل قريب
  });
  it('صيغ الجمع: مفرد/مثنى/قلة/كثرة', () => {
    expect(relativeAr(ago(60_000))).toBe('منذ دقيقة'); // 1 → مفرد
    expect(relativeAr(ago(2 * 60_000))).toBe('منذ دقيقتين'); // 2 → مثنى
    expect(strip(relativeAr(ago(5 * 60_000)))).toBe('منذ 5 دقائق'); // 3-10 → جمع قلة
    expect(strip(relativeAr(ago(20 * 60_000)))).toBe('منذ 20 دقيقة'); // 11+ → جمع كثرة
  });
  it('ساعات وأيام', () => {
    expect(relativeAr(ago(60 * 60_000))).toBe('منذ ساعة');
    expect(relativeAr(ago(2 * 60 * 60_000))).toBe('منذ ساعتين');
    expect(relativeAr(ago(24 * 60 * 60_000))).toBe('منذ يوم');
  });
  it('untilAr: «خلال» للمستقبل', () => {
    expect(strip(untilAr(new Date(Date.now() + 20 * 60_000)))).toBe('خلال 20 دقيقة');
    expect(strip(untilAr(new Date(Date.now() + 2 * 60 * 60_000)))).toBe('خلال ساعتين');
  });
});

describe('مدة الوقت', () => {
  it('دقائق فقط', () => {
    expect(durationAr(1)).toBe('دقيقة');
    expect(durationAr(2)).toBe('دقيقتين');
    expect(strip(durationAr(45))).toBe('45 دقيقة');
  });
  it('ساعة كاملة بدون دقايق', () => {
    expect(durationAr(60)).toBe('ساعة');
    expect(durationAr(120)).toBe('ساعتين');
  });
  it('ساعة ودقايق', () => {
    expect(durationAr(65)).toBe(`ساعة و${ltr(5)} دقائق`);
    expect(strip(durationAr(65))).toBe('ساعة و5 دقائق');
  });
  it('DASH للفاضي', () => {
    expect(durationAr(null)).toBe(DASH);
  });
});
