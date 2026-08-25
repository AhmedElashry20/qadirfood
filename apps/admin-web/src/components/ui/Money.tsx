import { money as formatMoney, DASH } from '../../lib/format';
import { cx } from './cx';

type MoneySize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE: Record<MoneySize, string> = {
  sm: 'text-[12.5px]',
  md: 'text-[14px]',
  lg: 'text-[19px]',
  xl: 'text-[26px]',
};

export interface MoneyProps {
  value: number | string | null | undefined;
  size?: MoneySize;
  className?: string;
  /** إخفاء «ر.س» — للجداول الضيقة اللي العملة فيها في رأس العمود. */
  hideCurrency?: boolean;
}

/**
 * مبلغ: الرقم بخط الأرقام (Outfit) و«ر.س» بـ Cairo بحجم ٧٢٪ منه.
 * الرقم معزول اتجاهياً بـ dir="ltr" عشان ما ينقلبش جوّه السطر العربي.
 */
export function Money({ value, size = 'md', className, hideCurrency = false }: MoneyProps) {
  const text = formatMoney(value);

  if (text === DASH) {
    return <span className={cx('font-num text-faint', SIZE[size], className)}>{DASH}</span>;
  }

  return (
    <span className={cx('inline-flex items-baseline gap-1 whitespace-nowrap', SIZE[size], className)}>
      <bdi className="font-num font-extrabold" dir="ltr">
        {text}
      </bdi>
      {hideCurrency ? null : <span className="font-sans font-bold text-[0.72em] opacity-70">ر.س</span>}
    </span>
  );
}
