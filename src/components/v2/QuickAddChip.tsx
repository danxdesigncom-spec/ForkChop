'use client';

import { Plus } from 'lucide-react';

interface Props {
  name: string;
  onAdd: (name: string) => void;
}

/** Quick-add suggestion: dashed line-strong border, a plus, 36px tall. */
export function QuickAddChip({ name, onAdd }: Props) {
  return (
    <button
      type="button"
      onClick={() => onAdd(name)}
      aria-label={`Add ${name}`}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-dashed border-line-strong bg-transparent pl-2.5 pr-3.5 text-sm font-medium text-foreground hover:bg-surface"
    >
      <Plus aria-hidden="true" size={16} />
      {name}
    </button>
  );
}
