'use client';

import { ALLERGENS } from '@/lib/allergens';

interface Props {
  selected: string[];
  onToggle: (allergenId: string) => void;
  onClear: () => void;
}

/**
 * Allergen toggles. Selecting one removes every recipe containing it outright —
 * including where it only appears as an optional garnish.
 */
export function AllergyFilter({ selected, onToggle, onClear }: Props) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Allergies</p>
        {selected.length > 0 && (
          <button type="button" onClick={onClear} className="text-xs text-brand hover:underline">
            Clear
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {ALLERGENS.map((allergen) => {
          const active = selected.includes(allergen.id);
          return (
            <button
              key={allergen.id}
              type="button"
              onClick={() => onToggle(allergen.id)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors
                ${
                  active
                    ? 'border-transparent text-white'
                    : 'border-border bg-surface text-muted hover:border-brand hover:text-brand'
                }`}
              style={active ? { backgroundColor: 'var(--score-low)' } : undefined}
            >
              <span aria-hidden>{allergen.emoji}</span>
              {allergen.label}
              {active && <span aria-hidden>✕</span>}
            </button>
          );
        })}
      </div>

      {selected.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          Recipes containing these are hidden completely, garnishes included. Always check labels —
          this filter reads our ingredient list, not the packet in your hand.
        </p>
      )}
    </div>
  );
}
