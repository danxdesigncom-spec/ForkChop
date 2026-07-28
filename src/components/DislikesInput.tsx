'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { Ingredient } from '@/lib/types';
import { categoryColor } from '@/lib/theme';

interface Props {
  /** Ingredient ids the user dislikes. */
  dislikes: string[];
  /** Full catalog, for turning stored ids back into names. */
  catalog: Map<string, Ingredient>;
  onAdd: (ingredientId: string) => void;
  onRemove: (ingredientId: string) => void;
  /** "Spicy" is a property of a recipe, not an ingredient, so it is separate. */
  avoidSpicy: boolean;
  onAvoidSpicyChange: (value: boolean) => void;
}

const COMMON_DISLIKES = ['coriander', 'mushroom', 'olives', 'aubergine', 'feta', 'chilli'];

/**
 * Ingredients the user would rather not eat. Unlike allergies these resolve to
 * a specific catalog id (picked from the suggestion list), so there is no
 * ambiguity about what is being excluded.
 */
export function DislikesInput({
  dislikes,
  catalog,
  onAdd,
  onRemove,
  avoidSpicy,
  onAvoidSpicyChange,
}: Props) {
  const [value, setValue] = useState('');
  const [suggestions, setSuggestions] = useState<Ingredient[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const query = value.trim();
  const canSuggest = query.length >= 2;

  useEffect(() => {
    if (query.length < 2) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ingredients?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { ingredients: Ingredient[] };
        setSuggestions(data.ingredients);
        setHighlighted(0);
        setOpen(true);
      } catch {
        // Aborted or offline — keep whatever was showing.
      }
    }, 120);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const visible = canSuggest ? suggestions.filter((s) => !dislikes.includes(s.id)) : [];
  const showList = open && visible.length > 0;

  const commit = (ingredient: Ingredient) => {
    onAdd(ingredient.id);
    setValue('');
    setOpen(false);
    inputRef.current?.focus();
  };

  const quickPicks = COMMON_DISLIKES.flatMap((id) => {
    const ingredient = catalog.get(id);
    return ingredient && !dislikes.includes(id) ? [ingredient] : [];
  });

  return (
    <div>
      <label htmlFor={`${listboxId}-input`} className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted">
        Dislikes
      </label>

      <div className="relative">
        <input
          id={`${listboxId}-input`}
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (showList) commit(visible[highlighted]);
              return;
            }
            if (e.key === 'ArrowDown' && visible.length > 0) {
              e.preventDefault();
              setOpen(true);
              setHighlighted((h) => (h + 1) % visible.length);
              return;
            }
            if (e.key === 'ArrowUp' && visible.length > 0) {
              e.preventDefault();
              setHighlighted((h) => (h - 1 + visible.length) % visible.length);
              return;
            }
            if (e.key === 'Escape') setOpen(false);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          placeholder="Anything you'd rather avoid…"
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-autocomplete="list"
          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm
                     placeholder:text-muted focus:border-brand focus:outline-none"
        />

        {showList && (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
          >
            {visible.map((suggestion, index) => (
              <li key={suggestion.id} role="option" aria-selected={index === highlighted}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => commit(suggestion)}
                  onMouseEnter={() => setHighlighted(index)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm
                    ${index === highlighted ? 'bg-brand-soft text-brand-strong' : 'hover:bg-surface-muted'}`}
                >
                  <span>{suggestion.name}</span>
                  <span className="text-xs capitalize" style={{ color: categoryColor(suggestion.category).fg }}>
                    {suggestion.category}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ul className="mt-2.5 flex flex-wrap gap-1.5">
        {avoidSpicy && (
          <li>
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
              style={{
                backgroundColor: 'var(--score-low-soft)',
                borderColor: 'var(--score-low)',
                color: 'var(--score-low)',
              }}
            >
              <span aria-hidden>🌶️</span>
              Spicy food
              <button
                type="button"
                onClick={() => onAvoidSpicyChange(false)}
                aria-label="Stop excluding spicy recipes"
                className="opacity-70 hover:opacity-100"
              >
                ✕
              </button>
            </span>
          </li>
        )}
      </ul>

      {dislikes.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {dislikes.map((id) => {
            const ingredient = catalog.get(id);
            return (
              <li key={id}>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-muted px-2.5 py-1 text-xs">
                  <span aria-hidden>🚫</span>
                  {ingredient?.name ?? id}
                  <button
                    type="button"
                    onClick={() => onRemove(id)}
                    aria-label={`Stop excluding ${ingredient?.name ?? id}`}
                    className="text-muted hover:text-foreground"
                  >
                    ✕
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {!avoidSpicy && (
          <button
            type="button"
            onClick={() => onAvoidSpicyChange(true)}
            className="rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted
                       hover:border-brand hover:text-brand"
          >
            + 🌶️ Spicy food
          </button>
        )}
      </div>

      {quickPicks.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {quickPicks.map((ingredient) => (
            <button
              key={ingredient.id}
              type="button"
              onClick={() => onAdd(ingredient.id)}
              className="rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted
                         hover:border-brand hover:text-brand"
            >
              + {ingredient.name}
            </button>
          ))}
        </div>
      )}

      {(dislikes.length > 0 || avoidSpicy) && (
        <p className="mt-2 text-xs text-muted">
          Recipes needing these are hidden. Where one is only a garnish — or the chilli is
          optional — the recipe stays, so you can just leave it out.
        </p>
      )}
    </div>
  );
}
