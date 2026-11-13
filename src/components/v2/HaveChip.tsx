'use client';

import { X } from 'lucide-react';
import { cn } from './cn';

interface Props {
  name: string;
  onRemove?: (name: string) => void;
  /**
   * `lg` is the mobile tray chip (36px, 28px remove target). Defaults to the
   * original 32px chip with a 24px remove target.
   */
  size?: 'md' | 'lg';
  /** v2B: a 2px brand ring for a just-added chip. */
  highlighted?: boolean;
}

/** "In your kitchen" chip: ink fill, oat text, a 24px remove button. */
export function HaveChip({ name, onRemove, size = 'md', highlighted }: Props) {
  const lg = size === 'lg';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-chip-have font-medium text-chip-have-fg',
        lg ? 'min-h-9 py-1 pl-3.5 pr-1 text-[15px]' : 'min-h-8 py-1 pl-3 pr-1.5 text-sm',
        // The ring sits outside the chip on the page colour, like the focus ring.
        'transition-shadow duration-500 motion-reduce:transition-none',
        highlighted && 'shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--brand)]',
      )}
    >
      {name}
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${name}`}
          onClick={() => onRemove(name)}
          className={cn(
            'inline-flex items-center justify-center rounded-full bg-chip-have-fg/15 text-chip-have-fg',
            lg ? 'h-7 w-7' : 'h-6 w-6',
          )}
        >
          <X aria-hidden="true" size={lg ? 15 : 14} strokeWidth={2} />
        </button>
      )}
    </span>
  );
}
