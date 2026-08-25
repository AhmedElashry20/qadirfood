import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

export type ButtonVariant = 'brand' | 'dark' | 'outline' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  brand: 'bg-brand text-ink hover:bg-brand-deep',
  dark: 'bg-ink text-white hover:bg-ink-soft',
  outline: 'bg-surface text-ink border border-line hover:bg-soft',
  danger: 'bg-bad text-white hover:bg-bad-deep',
  ghost: 'bg-transparent text-label hover:bg-chip',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-[30px] px-3 text-[11.5px] rounded-[9px]',
  md: 'h-[36px] px-4 text-[12.5px] rounded-[10px]',
  lg: 'h-[46px] px-6 text-[14px] rounded-xl',
};

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** بيعطّل الزر وبيعرض سبينر مكان المحتوى. */
  loading?: boolean;
  /** يملأ عرض الحاوية. */
  block?: boolean;
  icon?: ReactNode;
}

export function Button({
  children,
  variant = 'brand',
  size = 'md',
  loading = false,
  block = false,
  icon,
  className,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 font-extrabold whitespace-nowrap transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT[variant],
        SIZE[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      <span>{children}</span>
    </button>
  );
}

function Spinner() {
  return (
    <span
      className="h-[13px] w-[13px] shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden
    />
  );
}
