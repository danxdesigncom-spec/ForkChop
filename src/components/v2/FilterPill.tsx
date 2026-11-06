'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from './cn';
import { useDismiss } from './use-dismiss';

interface Props {
  label: string;
  /** Number of active selections; >0 shows the check and sprout fill. */
  activeCount?: number;
  /** Popover content, usually a FilterOptionList. */
  children: ReactNode;
  align?: 'start' | 'end';
}

/**
 * A filter pill that opens a popover. Esc or an outside click closes it, and
 * Esc returns focus to the pill. Active pills show a check icon, sprout fill
 * and aria-pressed so state isn't colour alone.
 */
export function FilterPill({ label, activeCount = 0, children, align = 'start' }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, panel, trigger);
  const active = activeCount > 0;

  return (
    <div className="relative">
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-pressed={active}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border pl-3.5 pr-3 text-sm',
          active
            ? 'border-brand bg-brand-soft font-semibold text-brand-strong'
            : 'border-border bg-surface font-medium text-foreground hover:border-line-strong',
        )}
      >
        {active && <Check aria-hidden="true" size={16} />}
        {label}
        {activeCount > 1 && <span className="font-mono text-xs">{activeCount}</span>}
        <ChevronDown aria-hidden="true" size={16} className={cn('transition-transform', open && 'rotate-180')} />
      </button>
      <div
        ref={panel}
        id={id}
        role="group"
        aria-label={`${label} filters`}
        hidden={!open}
        className={cn(
          'absolute top-full z-30 mt-2 max-h-[min(70vh,28rem)] w-72 overflow-y-auto rounded-2xl border border-border bg-surface p-3 shadow-lg',
          align === 'end' ? 'right-0' : 'left-0',
        )}
      >
        {children}
      </div>
    </div>
  );
}
