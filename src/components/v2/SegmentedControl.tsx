'use client';

import { cn } from './cn';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'md' | 'lg';
}

/** Raised track with toggle buttons (aria-pressed). Used for Pickup/Delivery and Appearance. */
export function SegmentedControl<T extends string>({ label, options, value, onChange, size = 'md' }: Props<T>) {
  return (
    <div role="group" aria-label={label} className="flex gap-0.5 rounded-xl bg-raised p-1">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex-1 rounded-[9px] px-3',
              size === 'lg' ? 'h-11 text-[15px]' : 'h-10 text-sm',
              active ? 'bg-selected font-semibold text-foreground shadow-sm' : 'font-medium text-muted',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
