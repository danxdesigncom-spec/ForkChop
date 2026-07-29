'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { Ingredient, IngredientCategory, ResolvedIngredient } from '@/lib/types';
import { categoryColor } from '@/lib/theme';
import { VoiceInput } from './VoiceInput';
import { BarcodeScanner } from './BarcodeScanner';

interface Props {
  pantry: string[];
  onAdd: (value: string, source?: 'typed' | 'scanned' | 'voice', barcode?: string) => void;
  onRemove: (value: string) => void;
  onClear: () => void;
  /** Raw entries the server could not resolve, shown as needing attention. */
  unrecognized: string[];
  /** Resolved pantry items, used to colour each chip by ingredient category. */
  resolved: ResolvedIngredient[];
}

const QUICK_ADD = [
  'Eggs', 'Chicken breast', 'Pasta', 'Rice', 'Onion', 'Garlic',
  'Chopped tomatoes', 'Cheddar', 'Potato', 'Milk', 'Butter', 'Chickpeas',
];

export function PantryInput({ pantry, onAdd, onRemove, onClear, unrecognized, resolved }: Props) {
  const [value, setValue] = useState('');
  const [suggestions, setSuggestions] = useState<Ingredient[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const [open, setOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const query = value.trim();
  // Below two characters the suggestion list is noise. Gating the render on
  // this rather than clearing state means the effect never has to setState
  // synchronously just to empty the list.
  const canSuggest = query.length >= 2;

  // Autocomplete against the catalog, debounced so typing stays smooth.
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
        // Aborted or offline — leaving the previous suggestions is fine.
      }
    }, 120);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setValue('');
    setSuggestions([]);
    setOpen(false);
    inputRef.current?.focus();
  };

  // Stale results from a longer query stay in state but must not be offered
  // once the box has been cut back below the suggestion threshold.
  const visible = canSuggest ? suggestions : [];
  const showList = open && visible.length > 0;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      const picked = showList ? visible[highlighted] : undefined;
      commit(picked ? picked.name : value);
      return;
    }
    if (event.key === 'ArrowDown' && visible.length > 0) {
      event.preventDefault();
      setOpen(true);
      setHighlighted((h) => (h + 1) % visible.length);
      return;
    }
    if (event.key === 'ArrowUp' && visible.length > 0) {
      event.preventDefault();
      setHighlighted((h) => (h - 1 + visible.length) % visible.length);
      return;
    }
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    // Backspace on an empty box removes the last chip, as in any tag input.
    if (event.key === 'Backspace' && value === '' && pantry.length > 0) {
      onRemove(pantry[pantry.length - 1]);
    }
  };

  const unresolved = new Set(unrecognized.map((u) => u.toLowerCase()));
  const categoryByRaw = new Map<string, IngredientCategory | null>(
    resolved.map((r) => [r.raw.toLowerCase(), r.category]),
  );
  const availableQuickAdds = QUICK_ADD.filter(
    (item) => !pantry.some((p) => p.toLowerCase() === item.toLowerCase()),
  );

  return (
    <div>
      <label htmlFor={`${listboxId}-input`} className="block text-sm font-medium mb-2">
        What&apos;s in your kitchen?
      </label>

      <div className="relative">
        <input
          id={`${listboxId}-input`}
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          placeholder="e.g. 2 chicken breasts, rice, tinned tomatoes…"
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-autocomplete="list"
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base
                     placeholder:text-muted focus:border-brand focus:outline-none"
        />

        {showList && (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border
                       bg-surface shadow-lg"
          >
            {visible.map((suggestion, index) => (
              <li key={suggestion.id} role="option" aria-selected={index === highlighted}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => commit(suggestion.name)}
                  onMouseEnter={() => setHighlighted(index)}
                  className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm
                    ${index === highlighted ? 'bg-brand-soft text-brand-strong' : 'hover:bg-surface-muted'}`}
                >
                  <span>{suggestion.name}</span>
                  <span
                    className="text-xs font-medium capitalize"
                    style={{ color: categoryColor(suggestion.category).fg }}
                  >
                    {suggestion.category}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-2 text-xs text-muted">
        Press <kbd className="rounded border border-border px-1">Enter</kbd> or comma to add. Amounts,
        plurals and typos are fine.
      </p>

      {/* Hands-free and packet-in-hand alternatives to typing. VoiceInput hides
          itself where the browser has no speech recognition. */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border-2 border-border
                     bg-surface px-3 py-2 text-sm font-semibold hover:border-brand hover:text-brand"
        >
          <span aria-hidden>📷</span> Scan
        </button>
        <VoiceInput onAdd={(value) => onAdd(value, 'voice')} />
      </div>

      {scannerOpen && (
        <BarcodeScanner
          onClose={() => setScannerOpen(false)}
          onAdd={(value, barcode) => onAdd(value, 'scanned', barcode)}
        />
      )}

      {pantry.length > 0 && (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {pantry.map((item) => {
              const isUnresolved = unresolved.has(item.toLowerCase());
              const color = categoryColor(categoryByRaw.get(item.toLowerCase()));
              return (
                <span
                  key={item}
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium"
                  style={
                    isUnresolved
                      ? {
                          backgroundColor: 'var(--score-low-soft)',
                          borderColor: 'var(--score-low)',
                          color: 'var(--score-low)',
                        }
                      : { backgroundColor: color.soft, borderColor: color.fg, color: color.fg }
                  }
                  title={isUnresolved ? "We don't recognise this one yet" : undefined}
                >
                  {isUnresolved && <span aria-hidden>⚠</span>}
                  {item}
                  <button
                    type="button"
                    onClick={() => onRemove(item)}
                    aria-label={`Remove ${item}`}
                    className="ml-0.5 opacity-60 hover:opacity-100"
                  >
                    ✕
                  </button>
                </span>
              );
            })}
          </div>

          <div className="mt-3 flex items-center gap-3 text-xs">
            <span className="text-muted">
              {pantry.length} item{pantry.length === 1 ? '' : 's'}
            </span>
            <button type="button" onClick={onClear} className="text-brand hover:underline">
              Clear all
            </button>
          </div>
        </>
      )}

      {availableQuickAdds.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Quick add</p>
          <div className="flex flex-wrap gap-1.5">
            {availableQuickAdds.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onAdd(item)}
                className="rounded-full border border-border px-2.5 py-1 text-xs text-muted
                           hover:border-brand hover:text-brand"
              >
                + {item}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
