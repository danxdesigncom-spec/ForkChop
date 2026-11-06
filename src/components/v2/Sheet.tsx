'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useFocusTrap } from './use-dismiss';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Pinned under the scrolling content, e.g. the Send button. */
  footer?: ReactNode;
}

/**
 * Mobile bottom sheet: a modal dialog with a focus trap. Esc and the close
 * button dismiss it, and focus goes back to whatever opened it.
 */
export function Sheet({ open, onClose, title, children, footer }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(open, panel);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-foreground/40" aria-hidden="true" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-[90dvh] w-full flex-col gap-4 rounded-t-3xl bg-background px-4 pb-7 pt-2.5"
      >
        <div aria-hidden="true" className="mx-auto h-1.5 w-10 rounded-full bg-line-strong/50" />
        <div className="flex items-center justify-between">
          <h2 id={titleId} className="font-display text-[28px] font-semibold text-foreground">
            {title}
          </h2>
          <button
            type="button"
            aria-label={`Close ${title.toLowerCase()}`}
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-raised text-foreground"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer}
      </div>
    </div>
  );
}
