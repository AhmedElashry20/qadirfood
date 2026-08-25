import type { ReactNode } from 'react';
import { cx, type Tone } from './cx';

export type DeltaTone = 'ok' | 'bad' | 'neutral';

const DELTA_LIGHT: Record<DeltaTone, string> = {
  ok: 'text-ok',
  bad: 'text-bad',
  neutral: 'text-muted',
};

const DELTA_DARK: Record<DeltaTone, string> = {
  ok: 'text-ok-bright',
  bad: 'text-bad',
  neutral: 'text-dim',
};

export interface KpiCardProps {
  label: string;
  /**
   * القيمة — مرّر «—» (من lib/format.DASH) لو الـ API مش بيوفّرها.
   * ممكن تبقى JSX عشان <Money /> أو تركيبة زي «12 / 40».
   */
  value: ReactNode;
  /** فرق عن الفترة السابقة، زي «+12٪». */
  delta?: string;
  deltaTone?: DeltaTone;
  /** ملاحظة صغيرة تحت القيمة — استخدمها لتوضيح إن البيانات ناقصة من الـ API. */
  note?: string;
  /** بطاقة سوداء بقيمة صفراء — أول بطاقة في التصميم. */
  inverted?: boolean;
  /** أيقونة/شارة صغيرة في رأس البطاقة. */
  badge?: ReactNode;
  tone?: Tone;
  className?: string;
}

/** بطاقة مؤشر — الصف العلوي في كل شاشة. */
export function KpiCard({
  label,
  value,
  delta,
  deltaTone = 'neutral',
  note,
  inverted = false,
  badge,
  className,
}: KpiCardProps) {
  return (
    <div
      className={cx(
        'rounded-card shadow-card p-[15px_16px] flex flex-col gap-[7px]',
        inverted ? 'bg-ink' : 'bg-surface border border-line',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cx('text-[11.5px] font-extrabold', inverted ? 'text-dim' : 'text-label')}>{label}</span>
        {badge}
      </div>

      <div
        className={cx(
          'font-num text-[26px] font-extrabold leading-none',
          inverted ? 'text-brand' : 'text-ink',
        )}
        dir="ltr"
      >
        {value}
      </div>

      {delta ? (
        <div
          className={cx('num text-[11.5px] font-extrabold', inverted ? DELTA_DARK[deltaTone] : DELTA_LIGHT[deltaTone])}
          dir="ltr"
        >
          {delta}
        </div>
      ) : null}

      {note ? (
        <div className={cx('text-[10.5px] font-bold leading-tight', inverted ? 'text-dim' : 'text-faint')}>{note}</div>
      ) : null}
    </div>
  );
}
