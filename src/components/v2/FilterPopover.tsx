'use client';

import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './cn';

export interface FilterOption {
  value: string;
  label: string;
  /** Facet count; options with 0 are disabled rather than hidden. */
  count?: number;
}

interface OptionListProps {
  legend: string;
  options: FilterOption[];
  selected: readonly string[];
  onToggle: (value: string) => void;
  /** Extra copy under the list, e.g. the allergy caveat. */
  note?: ReactNode;
}

/**
 * The option list that sits inside a FilterPill's popover. Native checkboxes
 * styled as rows, so selection is announced and keyboard-operable for free.
 */
export function FilterOptionList({ legend, options, selected, onToggle, note }: OptionListProps) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-[13px] font-semibold text-muted">{legend}</legend>
      {options.map((opt) => {
        const checked = selected.includes(opt.value);
        const empty = opt.count === 0 && !checked;
        return (
          <label
            key={opt.value}
            className={cn(
              'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 text-[15px]',
              checked ? 'bg-brand-soft text-brand-strong' : 'text-foreground hover:bg-raised',
              empty && 'cursor-not-allowed text-muted',
            )}
          >
            <input
              type="checkbox"
              className="peer sr-only"
              checked={checked}
              disabled={empty}
              onChange={() => onToggle(opt.value)}
            />
            <span
              aria-hidden="true"
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-[1.5px] peer-focus-visible:shadow-[var(--focus-ring)]',
                checked ? 'border-brand bg-brand text-on-brand' : 'border-line-strong',
              )}
            >
              {checked && <Check size={14} strokeWidth={2.5} />}
            </span>
            <span className="flex-1">{opt.label}</span>
            {opt.count !== undefined && <span className="font-mono text-xs text-muted">{opt.count}</span>}
          </label>
        );
      })}
      {note && <p className="mt-2 text-[13px] leading-relaxed text-muted">{note}</p>}
    </fieldset>
  );
}
