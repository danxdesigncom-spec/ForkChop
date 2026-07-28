'use client';

export interface ChipOption {
  id: string;
  label: string;
  emoji?: string;
  /** How many recipes in the corpus qualify; hides options nothing matches. */
  count?: number;
}

/**
 * Multi-select chips, shared by the diet, region and meal filters. One
 * component rather than three near-identical ones, so they stay consistent.
 */
export function ChipFilter({
  options,
  selected,
  onToggle,
  onClear,
  hint,
}: {
  options: ChipOption[];
  selected: string[];
  onToggle: (id: string) => void;
  onClear?: () => void;
  hint?: string;
}) {
  if (options.length === 0) return null;

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = selected.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onToggle(option.id)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors
                ${
                  active
                    ? 'border-brand bg-brand text-white'
                    : 'border-border bg-surface text-muted hover:border-brand hover:text-brand'
                }`}
            >
              {option.emoji && <span aria-hidden>{option.emoji}</span>}
              {option.label}
              {option.count !== undefined && (
                <span className={active ? 'opacity-80' : 'opacity-60'}>{option.count}</span>
              )}
            </button>
          );
        })}
      </div>

      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}

      {selected.length > 0 && onClear && (
        <button type="button" onClick={onClear} className="mt-2 text-xs text-brand hover:underline">
          Clear
        </button>
      )}
    </div>
  );
}
