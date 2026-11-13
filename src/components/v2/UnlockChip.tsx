'use client';

import { Plus } from 'lucide-react';

interface Props {
  name: string;
  /** How many more recipes become ready with this one ingredient. */
  unlocks: number;
  onAdd: (name: string) => void;
}

/** "One more thing" chip: sprout border, "+ Basil  +1 recipe". */
export function UnlockChip({ name, unlocks, onAdd }: Props) {
  return (
    <button
      type="button"
      onClick={() => onAdd(name)}
      // Starts with the visible text (WCAG 2.5.3 label in name), then the action.
      aria-label={`${name} +${unlocks} ${unlocks === 1 ? 'recipe' : 'recipes'}, add to basket`}
      className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-brand/30 bg-surface pl-2.5 pr-3.5 text-sm font-semibold text-brand hover:border-brand"
    >
      <Plus aria-hidden="true" size={16} />
      {name}
      <span className="font-normal" aria-hidden="true">
        +{unlocks} {unlocks === 1 ? 'recipe' : 'recipes'}
      </span>
    </button>
  );
}
