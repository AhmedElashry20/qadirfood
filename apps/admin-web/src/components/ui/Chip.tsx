import type { ReactNode } from 'react';
import { num } from '../../lib/format';
import { cx, type Tone } from './cx';

// ── الشرائح (Chip / Pill) ──

const TONE_STATIC: Record<Tone, string> = {
  brand: 'bg-tint text-gold-deep border-brand/40',
  neutral: 'bg-chip text-label border-line',
  ok: 'bg-ok-tint text-ok border-ok/30',
  warn: 'bg-tint-strong text-gold-deep border-gold/30',
  bad: 'bg-bad-tint text-bad-deep border-bad-line',
};

const TONE_ACTIVE: Record<Tone, string> = {
  brand: 'bg-brand text-ink border-brand',
  neutral: 'bg-ink text-white border-ink',
  ok: 'bg-ok text-white border-ok',
  warn: 'bg-gold text-white border-gold',
  bad: 'bg-bad text-white border-bad',
};

export interface ChipProps {
  children: ReactNode;
  tone?: Tone;
  /** الحالة المفعّلة — للفلاتر والتبويبات. */
  active?: boolean;
  /** عداد صغير جنب النص. */
  count?: number;
  onClick?: () => void;
  className?: string;
  title?: string;
}

/** شريحة صغيرة — حالة، وسم، أو فلتر قابل للضغط. */
export function Chip({ children, tone = 'neutral', active = false, count, onClick, className, title }: ChipProps) {
  const interactive = typeof onClick === 'function';
  const Tag = interactive ? 'button' : 'span';

  return (
    <Tag
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      title={title}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-pill border px-[10px] py-[4px] text-[11.5px] font-extrabold whitespace-nowrap',
        active ? TONE_ACTIVE[tone] : TONE_STATIC[tone],
        interactive && 'transition-colors hover:opacity-85 cursor-pointer',
        className,
      )}
    >
      <span>{children}</span>
      {typeof count === 'number' ? (
        <span
          className={cx(
            'num rounded-pill px-1.5 text-[10.5px] font-extrabold leading-[16px]',
            active ? 'bg-black/15' : 'bg-black/[0.06]',
          )}
          dir="ltr"
        >
          {num(count)}
        </span>
      ) : null}
    </Tag>
  );
}

/** نفس الـ Chip بحجم أصغر شوية — للاستخدام جوّه صفوف الجداول. */
export function Pill({ children, tone = 'neutral', active = false, count, onClick, className, title }: ChipProps) {
  return (
    <Chip
      tone={tone}
      active={active}
      count={count}
      onClick={onClick}
      title={title}
      className={cx('px-2 py-px text-[11px]', className)}
    >
      {children}
    </Chip>
  );
}

// ── النقطة الملوّنة ──

const DOT: Record<Tone, string> = {
  brand: 'bg-brand',
  neutral: 'bg-muted',
  ok: 'bg-ok-bright',
  warn: 'bg-gold',
  bad: 'bg-bad',
};

export interface StatusDotProps {
  tone: Tone;
  /** نص جنب النقطة — النمط «● جاهز». */
  children?: ReactNode;
  className?: string;
}

/** نمط «● » الملوّن اللي في التصميم. */
export function StatusDot({ tone, children, className }: StatusDotProps) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap', className)}>
      <span className={cx('h-[7px] w-[7px] shrink-0 rounded-full', DOT[tone])} aria-hidden />
      {children}
    </span>
  );
}
