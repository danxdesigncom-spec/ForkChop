'use client';

import type { SavedGroupBy } from '@/lib/saved-grouping';

/**
 * Segmented switch that picks how My Recipes is grouped.
 *
 * Small enough to inline into the header of the Saved view. Uses the same
 * chip vocabulary as the sidebar filters, so nothing new to learn — click
 * the active option to see grouping.
 */

const OPTIONS: { value: SavedGroupBy; label: string; emoji: string }[] = [
  { value: 'flat', label: 'All', emoji: '🍽️' },
  { value: 'meal-type', label: 'By meal', emoji: '🍳' },
  { value: 'match', label: 'By match', emoji: '🥗' },
];

export function SavedGroupToggle({
  value,
  onChange,
}: {
  value: SavedGroupBy;
  onChange: (next: SavedGroupBy) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Group saved recipes" className="flex flex-wrap gap-1.5">
      {OPTIONS.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-xs font-semibold transition-colors
              ${
                active
                  ? 'border-brand bg-brand-soft text-brand-strong'
                  : 'border-border bg-surface text-muted hover:border-brand hover:text-brand'
              }`}
          >
            <span aria-hidden>{option.emoji}</span>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
