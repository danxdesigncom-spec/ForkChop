'use client';

import { Sprout } from 'lucide-react';
import { UnlockChip } from './UnlockChip';

export interface Unlock {
  name: string;
  unlocks: number;
}

interface Props {
  items: Unlock[];
  onAdd: (name: string) => void;
}

/** Sprout panel: leaf tile, heading and a row of UnlockChips (scrolls on mobile). */
export function UnlockStrip({ items, onAdd }: Props) {
  if (items.length === 0) return null;
  return (
    <section
      aria-labelledby="unlock-heading"
      className="flex flex-col gap-3 rounded-2xl bg-brand-soft p-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-brand text-on-brand sm:flex"
        >
          <Sprout size={20} />
        </span>
        <h2 id="unlock-heading" className="whitespace-nowrap text-[15px] font-semibold text-brand-strong">
          One more ingredient unlocks:
        </h2>
      </div>
      <div className="-mr-4 flex gap-2 overflow-x-auto sm:mr-0 sm:flex-wrap sm:overflow-visible">
        {items.map((item) => (
          <UnlockChip key={item.name} name={item.name} unlocks={item.unlocks} onAdd={onAdd} />
        ))}
      </div>
    </section>
  );
}
