'use client';

import { Check, Plus } from 'lucide-react';
import { cn } from './cn';

interface Props {
  name: string;
  inBasket?: boolean;
  onAdd: (name: string) => void;
}

/** Missing ingredient on a recipe card: surface chip with a brand plus. */
export function MissingChip({ name, inBasket, onAdd }: Props) {
  return (
    <button
      type="button"
      onClick={() => onAdd(name)}
      aria-label={inBasket ? `${name} is in your basket` : `Add ${name} to basket`}
      aria-pressed={inBasket || undefined}
      className={cn(
        'inline-flex min-h-8 items-center gap-1 rounded-full border pl-2 pr-3 text-[13px] font-medium',
        inBasket
          ? 'border-brand bg-brand-soft text-brand-strong'
          : 'border-border bg-surface text-foreground hover:border-line-strong',
      )}
    >
      {inBasket ? (
        <Check aria-hidden="true" size={14} className="text-brand" />
      ) : (
        <Plus aria-hidden="true" size={14} className="text-brand" />
      )}
      {name}
    </button>
  );
}
