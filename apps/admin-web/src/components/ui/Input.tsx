import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { useId } from 'react';
import { cx } from './cx';

const FIELD_BASE =
  'w-full rounded-[10px] border border-line bg-surface px-3 text-[12.5px] font-bold text-ink placeholder:text-faint placeholder:font-bold transition-colors focus:border-brand disabled:cursor-not-allowed disabled:bg-soft disabled:text-faint';

// ── حقل بعنوان ──

export interface FieldProps {
  label?: ReactNode;
  children: ReactNode;
  /** رسالة خطأ حمراء تحت الحقل. */
  error?: string | null;
  /** ملاحظة رمادية تحت الحقل. */
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  htmlFor?: string;
}

/** غلاف حقل — عنوان + محتوى + خطأ/ملاحظة. */
export function Field({ label, children, error, hint, required = false, className, htmlFor }: FieldProps) {
  return (
    <div className={cx('flex flex-col gap-[7px]', className)}>
      {label ? (
        <label htmlFor={htmlFor} className="text-[12px] font-extrabold text-label">
          {label}
          {required ? <span className="text-bad"> *</span> : null}
        </label>
      ) : null}
      {children}
      {error ? <p className="text-[11.5px] font-bold text-bad">{error}</p> : null}
      {!error && hint ? <p className="text-[11px] font-bold text-faint leading-snug">{hint}</p> : null}
    </div>
  );
}

// ── إدخال نصي ──

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** أرقام/إيميل — خط Outfit واتجاه LTR. */
  latin?: boolean;
  invalid?: boolean;
}

export function TextInput({ className, latin = false, invalid = false, ...rest }: TextInputProps) {
  return (
    <input
      dir={latin ? 'ltr' : undefined}
      className={cx(FIELD_BASE, 'h-[42px]', latin && 'font-num', invalid && 'border-bad', className)}
      {...rest}
    />
  );
}

// ── بحث ──

export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'size'> {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** عرض الحقل — الافتراضي في التصميم ٢٤٠px. */
  width?: number | string;
}

/** حقل بحث في الشريط العلوي. */
export function SearchInput({
  value,
  onChange,
  placeholder = 'بحث…',
  width = 240,
  className,
  ...rest
}: SearchInputProps) {
  return (
    <div className="relative shrink-0" style={{ width }}>
      <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-[13px] text-faint">🔍</span>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={cx(FIELD_BASE, 'h-[34px] ps-9', className)}
        {...rest}
      />
    </div>
  );
}

// ── قائمة منسدلة ──

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value' | 'size'> {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** خيار فاضي في الأول (زي «كل المناطق»). */
  placeholder?: string;
  invalid?: boolean;
}

/** select أصلي بستايل النظام. */
export function Select({ value, onChange, options, placeholder, className, invalid = false, ...rest }: SelectProps) {
  return (
    <div className="relative shrink-0">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cx(FIELD_BASE, 'h-[34px] appearance-none pe-8 cursor-pointer', invalid && 'border-bad', className)}
        {...rest}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-[9px] text-muted">▼</span>
    </div>
  );
}

// ── مفتاح تبديل ──

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function Toggle({ checked, onChange, label, disabled = false, className }: ToggleProps) {
  const id = useId();

  return (
    <label
      htmlFor={id}
      className={cx(
        'inline-flex items-center gap-2.5',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        className,
      )}
    >
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative h-[22px] w-[40px] shrink-0 rounded-pill transition-colors',
          checked ? 'bg-brand' : 'bg-line',
          disabled && 'cursor-not-allowed',
        )}
      >
        <span
          className={cx(
            'absolute top-[3px] h-4 w-4 rounded-full bg-surface shadow-card transition-all',
            // RTL: المفعّل بيروح الشمال بصرياً
            checked ? 'start-[21px]' : 'start-[3px]',
          )}
        />
      </button>
      {label ? <span className="text-[12.5px] font-bold text-ink">{label}</span> : null}
    </label>
  );
}

// ── زر اختيار دائري ──

export interface RadioDotProps {
  checked: boolean;
  onChange: () => void;
  label?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function RadioDot({ checked, onChange, label, disabled = false, className }: RadioDotProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={cx(
        'inline-flex items-center gap-2.5 text-start',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        className,
      )}
    >
      <span
        className={cx(
          'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors',
          checked ? 'border-brand' : 'border-line',
        )}
      >
        {checked ? <span className="h-[9px] w-[9px] rounded-full bg-brand" /> : null}
      </span>
      {label ? <span className="text-[12.5px] font-bold text-ink">{label}</span> : null}
    </button>
  );
}
