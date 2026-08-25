import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';

/** Esc للإغلاق + قفل تمرير الصفحة طول ما الطبقة مفتوحة. */
function useOverlayBehaviour(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);
}

// ── نافذة منبثقة ──

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** صف الأزرار أسفل النافذة. */
  footer?: ReactNode;
  /** عرض النافذة بالبكسل — الافتراضي ٤٨٠. */
  width?: number;
  className?: string;
}

export function Modal({ open, onClose, title, children, footer, width = 480, className }: ModalProps) {
  useOverlayBehaviour(open, onClose);
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} aria-hidden />

      <div
        className={cx(
          'relative z-10 flex max-h-[85vh] w-full flex-col overflow-hidden rounded-panel bg-surface shadow-float',
          className,
        )}
        style={{ maxWidth: width }}
      >
        {title ? (
          <header className="flex shrink-0 items-center justify-between gap-4 border-b border-line px-5 py-4">
            <h2 className="text-[16px] font-black text-ink">{title}</h2>
            <CloseButton onClose={onClose} />
          </header>
        ) : null}

        <div className="flex-1 overflow-auto px-5 py-4">{children}</div>

        {footer ? (
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-soft px-5 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

// ── لوح جانبي ──

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** عرض اللوح بالبكسل — الافتراضي ٤٢٠. */
  width?: number;
  /** الجانب — في RTL «end» معناه الشمال بصرياً. */
  side?: 'start' | 'end';
  className?: string;
}

/** لوح جانبي — تفاصيل الطلب/الكابتن بتتفتح فيه. */
export function Drawer({ open, onClose, title, children, footer, width = 420, side = 'start', className }: DrawerProps) {
  useOverlayBehaviour(open, onClose);
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} aria-hidden />

      <aside
        className={cx(
          'absolute inset-y-0 flex w-full flex-col bg-surface shadow-float',
          side === 'start' ? 'start-0' : 'end-0',
          className,
        )}
        style={{ maxWidth: width }}
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 className="text-[16px] font-black text-ink">{title}</h2>
          <CloseButton onClose={onClose} />
        </header>

        <div className="flex-1 overflow-auto px-5 py-4">{children}</div>

        {footer ? (
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-soft px-5 py-3">
            {footer}
          </footer>
        ) : null}
      </aside>
    </div>,
    document.body,
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="إغلاق"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] text-[15px] font-bold text-muted transition-colors hover:bg-chip hover:text-ink"
    >
      ✕
    </button>
  );
}
