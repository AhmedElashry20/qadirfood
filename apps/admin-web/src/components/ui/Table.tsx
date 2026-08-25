import { createContext, useContext, type ReactNode } from 'react';
import { cx } from './cx';

/**
 * جدول مبني على CSS grid — كل صف بياخد نفس الـ gridTemplateColumns من الـ context،
 * فالأعمدة بتفضل متطابقة من غير ما نستخدم <table> (اللي مبيعرفش يعمل صفوف قابلة للضغط
 * وحواف مدوّرة بشكل نضيف).
 *
 * الاستخدام:
 *   <Table gridTemplateColumns="90px 1fr 130px 110px">
 *     <THead><TH>#</TH><TH>العميل</TH>…</THead>
 *     {rows.map(r => <TR key={r.id} selected={…} onClick={…}><TD>…</TD></TR>)}
 *   </Table>
 */
const GridContext = createContext<string>('1fr');

export interface TableProps {
  children: ReactNode;
  /** قيمة CSS grid-template-columns — إلزامية عملياً لكل جدول. */
  gridTemplateColumns: string;
  className?: string;
}

export function Table({ children, gridTemplateColumns, className }: TableProps) {
  return (
    <GridContext.Provider value={gridTemplateColumns}>
      <div className={cx('w-full', className)} role="table">
        {children}
      </div>
    </GridContext.Provider>
  );
}

export interface THeadProps {
  children: ReactNode;
  className?: string;
}

/** صف الرأس — خلفية soft ونص head. */
export function THead({ children, className }: THeadProps) {
  const gridTemplateColumns = useContext(GridContext);

  return (
    <div
      role="row"
      style={{ gridTemplateColumns }}
      className={cx(
        'grid items-center gap-3 rounded-[10px] bg-soft px-3 py-[9px] text-xs font-extrabold text-head',
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface THProps {
  children?: ReactNode;
  className?: string;
  /** محاذاة العمود — الافتراضي بداية السطر (يمين في RTL). */
  align?: 'start' | 'center' | 'end';
}

const ALIGN = {
  start: 'text-start justify-start',
  center: 'text-center justify-center',
  end: 'text-end justify-end',
} as const;

export function TH({ children, className, align = 'start' }: THProps) {
  return (
    <div role="columnheader" className={cx('truncate', ALIGN[align], className)}>
      {children}
    </div>
  );
}

export interface TRProps {
  children: ReactNode;
  className?: string;
  /** الصف المحدد — إطار brand زي التصميم. */
  selected?: boolean;
  /** صف باهت — للملغي/المؤرشف. */
  muted?: boolean;
  /** نغمة خطر — صفوف الالتزام والمخالفات. */
  danger?: boolean;
  onClick?: () => void;
}

export function TR({ children, className, selected = false, muted = false, danger = false, onClick }: TRProps) {
  const gridTemplateColumns = useContext(GridContext);
  const interactive = typeof onClick === 'function';

  return (
    <div
      role="row"
      onClick={onClick}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      tabIndex={interactive ? 0 : undefined}
      style={{ gridTemplateColumns }}
      className={cx(
        'grid items-center gap-3 border-b border-hair px-3 py-[11px] text-[13px] font-bold',
        selected && 'rounded-[10px] bg-tint-soft outline outline-2 outline-brand -outline-offset-2',
        !selected && danger && 'bg-bad-row',
        muted && 'text-faint',
        interactive && !selected && 'cursor-pointer transition-colors hover:bg-soft',
        interactive && selected && 'cursor-pointer',
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface TDProps {
  children?: ReactNode;
  className?: string;
  align?: 'start' | 'center' | 'end';
  /** نص ثانوي باهت. */
  muted?: boolean;
  /** رقم/نص لاتيني — بياخد خط الأرقام واتجاه LTR. */
  numeric?: boolean;
}

export function TD({ children, className, align = 'start', muted = false, numeric = false }: TDProps) {
  return (
    <div
      role="cell"
      dir={numeric ? 'ltr' : undefined}
      className={cx(
        'min-w-0 truncate',
        ALIGN[align],
        numeric && 'font-num',
        muted && 'text-faint font-bold',
        className,
      )}
    >
      {children}
    </div>
  );
}
