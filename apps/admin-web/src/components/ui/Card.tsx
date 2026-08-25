import type { ReactNode } from 'react';
import { cx } from './cx';

type Padding = 'none' | 'sm' | 'md' | 'lg';

const PADDING: Record<Padding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-[14px]',
  lg: 'p-[18px]',
};

export interface CardProps {
  children?: ReactNode;
  className?: string;
  padding?: Padding;
  /** بطاقة سوداء — القيمة جواها بتبقى brand. */
  inverted?: boolean;
}

/** البطاقة الأساسية — سطح أبيض، حواف card، ظل خفيف. */
export function Card({ children, className, padding = 'md', inverted = false }: CardProps) {
  return (
    <div
      className={cx(
        'rounded-card shadow-card',
        inverted ? 'bg-ink text-white' : 'bg-surface border border-line',
        PADDING[padding],
        className,
      )}
    >
      {children}
    </div>
  );
}

/** لوح أكبر — نفس البطاقة بحواف panel، للأقسام الكبيرة. */
export function Panel({ children, className, padding = 'lg', inverted = false }: CardProps) {
  return (
    <div
      className={cx(
        'rounded-panel shadow-card',
        inverted ? 'bg-ink text-white' : 'bg-surface border border-line',
        PADDING[padding],
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface SectionTitleProps {
  children: ReactNode;
  /** نص ثانوي على الشمال (زي «آخر تحديث ...»). */
  aside?: ReactNode;
  className?: string;
}

/** عنوان قسم داخل بطاقة. */
export function SectionTitle({ children, aside, className }: SectionTitleProps) {
  return (
    <div className={cx('flex items-center justify-between gap-3 mb-3', className)}>
      <h2 className="text-[14.5px] font-black text-ink">{children}</h2>
      {aside ? <div className="text-[11.5px] font-bold text-muted">{aside}</div> : null}
    </div>
  );
}
