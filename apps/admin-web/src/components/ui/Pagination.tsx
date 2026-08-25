import { num } from '../../lib/format';
import { cx } from './cx';

export interface PaginationProps {
  /** رقم الصفحة الحالية — يبدأ من ١. */
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  className?: string;
}

/** أقصى عدد أزرار أرقام قبل ما نستخدم «…». */
const WINDOW = 5;

function pageList(page: number, pageCount: number): Array<number | 'gap'> {
  if (pageCount <= WINDOW + 2) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, pageCount, page]);
  for (let offset = 1; offset <= 1; offset += 1) {
    if (page - offset > 1) pages.add(page - offset);
    if (page + offset < pageCount) pages.add(page + offset);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result: Array<number | 'gap'> = [];

  sorted.forEach((value, index) => {
    if (index > 0 && value - sorted[index - 1] > 1) result.push('gap');
    result.push(value);
  });

  return result;
}

/** «عرض ١-٢٥ من ١٬٨٤٢» + أزرار أرقام ٣٠×٣٠. */
export function Pagination({ page, pageSize, total, onChange, className }: PaginationProps) {
  const pageCount = Math.max(Math.ceil(total / Math.max(pageSize, 1)), 1);
  const safePage = Math.min(Math.max(page, 1), pageCount);

  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  const go = (next: number) => {
    const clamped = Math.min(Math.max(next, 1), pageCount);
    if (clamped !== safePage) onChange(clamped);
  };

  return (
    <div className={cx('flex items-center justify-between gap-4 pt-3', className)}>
      <p className="text-[11.5px] font-bold text-muted">
        عرض{' '}
        <span className="num text-ink" dir="ltr">
          {num(from)}-{num(to)}
        </span>{' '}
        من{' '}
        <span className="num text-ink" dir="ltr">
          {num(total)}
        </span>
      </p>

      {pageCount > 1 ? (
        <div className="flex items-center gap-1.5">
          <NavButton label="الصفحة السابقة" disabled={safePage === 1} onClick={() => go(safePage - 1)}>
            ›
          </NavButton>

          {pageList(safePage, pageCount).map((entry, index) =>
            entry === 'gap' ? (
              <span key={`gap-${index}`} className="px-1 text-[12px] font-bold text-faint">
                …
              </span>
            ) : (
              <button
                key={entry}
                type="button"
                onClick={() => go(entry)}
                aria-current={entry === safePage ? 'page' : undefined}
                className={cx(
                  'num h-[30px] w-[30px] rounded-[9px] text-[12px] font-extrabold transition-colors',
                  entry === safePage
                    ? 'bg-brand text-ink'
                    : 'border border-line bg-surface text-label hover:bg-soft',
                )}
              >
                {entry}
              </button>
            ),
          )}

          <NavButton label="الصفحة التالية" disabled={safePage === pageCount} onClick={() => go(safePage + 1)}>
            ‹
          </NavButton>
        </div>
      ) : null}
    </div>
  );
}

function NavButton({
  children,
  disabled,
  onClick,
  label,
}: {
  children: string;
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="h-[30px] w-[30px] rounded-[9px] border border-line bg-surface text-[14px] font-extrabold text-label transition-colors hover:bg-soft disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
