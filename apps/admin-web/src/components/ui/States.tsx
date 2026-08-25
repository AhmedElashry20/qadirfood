import type { ReactNode } from 'react';
import { Button } from './Button';
import { cx } from './cx';

// ── تحميل ──

export interface LoadingProps {
  /** 'skeleton' لبلوكات رمادية، 'spinner' لدائرة دوّارة. */
  variant?: 'skeleton' | 'spinner';
  /** عدد صفوف الهيكل العظمي. */
  rows?: number;
  /** ارتفاع الصف الواحد. */
  height?: number;
  className?: string;
  label?: string;
}

/** حالة التحميل — الافتراضي هيكل عظمي بشكل صفوف جدول. */
export function Loading({ variant = 'skeleton', rows = 6, height = 44, className, label }: LoadingProps) {
  if (variant === 'spinner') {
    return (
      <div className={cx('flex flex-col items-center justify-center gap-3 py-12', className)} role="status">
        <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-line border-t-brand" aria-hidden />
        <span className="text-[12px] font-bold text-muted">{label ?? 'جارِ التحميل…'}</span>
      </div>
    );
  }

  return (
    <div className={cx('flex flex-col gap-2', className)} role="status" aria-label={label ?? 'جارِ التحميل'}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="animate-pulse rounded-[10px] bg-chip" style={{ height }} />
      ))}
    </div>
  );
}

/** بلوك هيكل عظمي واحد — للاستخدام جوّه بطاقة. */
export function Skeleton({ className, height = 16 }: { className?: string; height?: number }) {
  return <div className={cx('animate-pulse rounded-[8px] bg-chip', className)} style={{ height }} />;
}

// ── فاضي ──

export interface EmptyStateProps {
  /** إيموجي أو أيقونة. */
  icon?: ReactNode;
  title: string;
  /** شرح — استخدمه لو الميزة محتاجة endpoint لسه مش موجود. */
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon = '📭', title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cx('flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center', className)}>
      <span className="text-[28px] leading-none opacity-60" aria-hidden>
        {icon}
      </span>
      <p className="text-[13.5px] font-black text-ink">{title}</p>
      {description ? (
        <p className="max-w-[420px] text-[12px] font-bold leading-relaxed text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

// ── خطأ ──

export interface ErrorStateProps {
  /** رسالة السيرفر العربية — من ApiError.message. */
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ message, onRetry, className }: ErrorStateProps) {
  return (
    <div className={cx('flex flex-1 flex-col items-center justify-center gap-2.5 px-6 py-12 text-center', className)}>
      <span className="text-[26px] leading-none" aria-hidden>
        ⚠️
      </span>
      <p className="text-[13.5px] font-black text-bad-deep">تعذّر تحميل البيانات</p>
      <p className="max-w-[420px] text-[12px] font-bold leading-relaxed text-muted">
        {message || 'حصل خطأ غير متوقع'}
      </p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-1">
          إعادة المحاولة
        </Button>
      ) : null}
    </div>
  );
}

/** ملاحظة «الميزة دي محتاجة endpoint» — بديل أمين للبيانات الوهمية. */
export function MissingDataNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx('text-[11px] font-bold leading-relaxed text-faint', className)}>{children}</p>
  );
}
