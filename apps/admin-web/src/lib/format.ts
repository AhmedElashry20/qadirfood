/**
 * تنسيق الأرقام والتواريخ — عربي أولاً.
 *
 * ملاحظة مهمة: الأرقام بتتعرض بالأرقام اللاتينية (0-9) مش الهندية (٠-٩)،
 * لأن خط الأرقام في النظام (Outfit / font-num) مافيهوش أرقام هندية أصلاً،
 * فلو استخدمناها هتقع على Cairo وتكسر شكل التصميم. النصوص العربية الثابتة
 * في التصميم (زي «عرض ١-٢٥») بتفضل زي ما هي، لكن أي رقم جاي من الـ API لاتيني.
 */

/** U+2066 LEFT-TO-RIGHT ISOLATE */
const LRI = '⁦';
/** U+2069 POP DIRECTIONAL ISOLATE */
const PDI = '⁩';

/** الشرطة اللي بتتعرض لما القيمة مش متاحة من الـ API. */
export const DASH = '—';

type Numeric = number | string | null | undefined;

function toNumber(value: Numeric): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * بيلفّ أي نص لاتيني/رقمي في عازل اتجاه عشان ما يتقلبش جوّه جملة عربية.
 * استخدمه لكل رقم بيتحط وسط كلام عربي: `منذ ${ltr(num(8))} دقائق`.
 */
export function ltr(value: string | number): string {
  return `${LRI}${value}${PDI}`;
}

/** أرقام بفواصل الآلاف — من غير كسور. */
export function num(value: Numeric): string {
  const n = toNumber(value);
  if (n === null) return DASH;
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}

/** مبلغ — كسرين عشريين بس لما يكون فيه كسور فعلاً. */
export function money(value: Numeric): string {
  const n = toNumber(value);
  if (n === null) return DASH;
  const hasFraction = Math.abs(n - Math.trunc(n)) > 1e-9;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(n);
}

/** «1,234.50 ر.س» — الرقم معزول اتجاهياً. */
export function sar(value: Numeric): string {
  const n = toNumber(value);
  if (n === null) return DASH;
  return `${ltr(money(n))} ر.س`;
}

/** نسبة مئوية — «12.5%». */
export function pct(value: Numeric, digits = 1): string {
  const n = toNumber(value);
  if (n === null) return DASH;
  const hasFraction = Math.abs(n - Math.trunc(n)) > 1e-9;
  return `${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: hasFraction ? digits : 0,
    maximumFractionDigits: digits,
  }).format(n)}%`;
}

function parseDate(iso: string | number | Date | null | undefined): Date | null {
  if (iso === null || iso === undefined || iso === '') return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** «2026-07-20 14:35» — ثابت ومقروء، مش locale-dependent. */
export function dateTime(iso: string | number | Date | null | undefined): string {
  const d = parseDate(iso);
  if (!d) return DASH;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(
    d.getMinutes(),
  )}`;
}

/** «2026-07-20» */
export function dateOnly(iso: string | number | Date | null | undefined): string {
  const d = parseDate(iso);
  if (!d) return DASH;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** «14:35» */
export function timeOnly(iso: string | number | Date | null | undefined): string {
  const d = parseDate(iso);
  if (!d) return DASH;
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * صيغة الجمع العربية: مفرد / مثنى / جمع قلة (3-10) / جمع كثرة (11+).
 * لازم تتعمل بالإيد — Intl.RelativeTimeFormat بيطلّع أرقام هندية وصيغة «قبل» مش «منذ».
 */
function arabicPlural(n: number, forms: { one: string; two: string; few: string; many: string }): string {
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  if (n >= 3 && n <= 10) return `${ltr(n)} ${forms.few}`;
  return `${ltr(n)} ${forms.many}`;
}

/** «منذ ٨ دقائق» — الأرقام لاتينية ومعزولة اتجاهياً. */
export function relativeAr(iso: string | number | Date | null | undefined): string {
  const d = parseDate(iso);
  if (!d) return DASH;

  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);

  if (seconds < 0) return 'الآن';
  if (seconds < 45) return 'الآن';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `منذ ${arabicPlural(Math.max(minutes, 1), {
      one: 'دقيقة',
      two: 'دقيقتين',
      few: 'دقائق',
      many: 'دقيقة',
    })}`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `منذ ${arabicPlural(hours, { one: 'ساعة', two: 'ساعتين', few: 'ساعات', many: 'ساعة' })}`;
  }

  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `منذ ${arabicPlural(days, { one: 'يوم', two: 'يومين', few: 'أيام', many: 'يوماً' })}`;
  }

  const months = Math.floor(days / 30);
  if (months < 12) {
    return `منذ ${arabicPlural(months, { one: 'شهر', two: 'شهرين', few: 'شهور', many: 'شهراً' })}`;
  }

  const years = Math.floor(months / 12);
  return `منذ ${arabicPlural(years, { one: 'سنة', two: 'سنتين', few: 'سنوات', many: 'سنة' })}`;
}

/** «منذ ٨ دقائق» أو «خلال ٨ دقائق» حسب اتجاه الفرق — مفيد لـ ETA. */
export function untilAr(iso: string | number | Date | null | undefined): string {
  const d = parseDate(iso);
  if (!d) return DASH;

  const seconds = Math.floor((d.getTime() - Date.now()) / 1000);
  if (seconds <= 0) return relativeAr(d);

  const minutes = Math.max(Math.floor(seconds / 60), 1);
  if (minutes < 60) {
    return `خلال ${arabicPlural(minutes, { one: 'دقيقة', two: 'دقيقتين', few: 'دقائق', many: 'دقيقة' })}`;
  }

  const hours = Math.floor(minutes / 60);
  return `خلال ${arabicPlural(hours, { one: 'ساعة', two: 'ساعتين', few: 'ساعات', many: 'ساعة' })}`;
}

/** مدة بالدقائق → «١٢ دقيقة» / «ساعة و٥ دقائق». */
export function durationAr(totalMinutes: Numeric): string {
  const n = toNumber(totalMinutes);
  if (n === null) return DASH;

  const minutes = Math.max(Math.round(n), 0);
  if (minutes < 60) {
    return arabicPlural(minutes, { one: 'دقيقة', two: 'دقيقتين', few: 'دقائق', many: 'دقيقة' });
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hoursText = arabicPlural(hours, { one: 'ساعة', two: 'ساعتين', few: 'ساعات', many: 'ساعة' });
  if (!rest) return hoursText;

  return `${hoursText} و${arabicPlural(rest, {
    one: 'دقيقة',
    two: 'دقيقتين',
    few: 'دقائق',
    many: 'دقيقة',
  })}`;
}
