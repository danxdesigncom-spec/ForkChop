'use client';

import { X } from 'lucide-react';

interface Props {
  name: string;
  onRemove?: (name: string) => void;
}

/** "In your kitchen" chip: ink fill, oat text, a 24px remove button. */
export function HaveChip({ name, onRemove }: Props) {
  return (
    <span className="inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-full bg-chip-have py-1 pl-3 pr-1.5 text-sm font-medium text-chip-have-fg">
      {name}
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${name}`}
          onClick={() => onRemove(name)}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-chip-have-fg/15 text-chip-have-fg"
        >
          <X aria-hidden="true" size={14} strokeWidth={2} />
        </button>
      )}
    </span>
  );
}
