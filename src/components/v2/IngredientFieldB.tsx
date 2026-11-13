'use client';

import { Check, Mic, Pencil, Plus, ScanBarcode, Search } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useVoiceCapture } from '@/hooks/useVoiceCapture';
import type { Ingredient } from '@/lib/types';
import { Button } from './Button';
import { ScanPanelB } from './ScanPanelB';
import { cn } from './cn';

/**
 * v2B ingredient field, "input first" (docs/redesign/07-ingredient-bar-b.md §1, §2, §4, §5).
 *
 * The field only adds. It never holds chips, never wraps and never changes
 * height: 52px from 768px up, 56px below. Left to right: search icon, input,
 * divider, Speak, Scan.
 *
 * - Typing ≥2 characters opens a WAI-ARIA combobox listbox: autocomplete from
 *   /api/ingredients, or, for a typo, "Did you mean …?" and "Add … anyway".
 *   Enter or comma adds; Esc closes. Backspace never removes a chip.
 * - Speak (only where speech recognition exists) turns the field itself into
 *   the listening state at the same height. Nothing is added until "Add N".
 * - Scan opens ScanPanelB: anchored under the field on desktop, full screen
 *   on mobile. Never auto-adds.
 */

export interface IngredientFieldBHandle {
  focus: () => void;
  /** Put text in the field and focus it ("Not right? Search instead"). */
  prefill: (text: string) => void;
}

interface Props {
  onAdd: (name: string, source: 'typed' | 'scanned', barcode?: string) => void;
  /** Voice: everything confirmed with "Add N", in one change. */
  onAddMany: (names: string[]) => void;
  /** Routes messages through the page's single polite live region. */
  announce: (message: string) => void;
  /** Below 768px: 56px field, icon-only buttons, full-screen scanner. */
  isMobile: boolean;
  /**
   * `header`: anything shown under the field floats over the page.
   * `hero`: helper and error text sit in the flow under the field.
   */
  placement: 'header' | 'hero';
}

interface Suggestions {
  query: string;
  ingredients: Ingredient[];
  correction: Ingredient | null;
}

type Option = { id: string; kind: 'ingredient' | 'correction' | 'anyway'; value: string };

/** Bold the part of `name` that matches what was typed. */
function withMatch(name: string, query: string): ReactNode {
  const at = name.toLowerCase().indexOf(query.toLowerCase());
  if (!query || at < 0) return name;
  return (
    <>
      {name.slice(0, at)}
      <strong className="font-semibold">{name.slice(at, at + query.length)}</strong>
      {name.slice(at + query.length)}
    </>
  );
}

export const IngredientFieldB = forwardRef<IngredientFieldBHandle, Props>(function IngredientFieldB(
  { onAdd, onAddMany, announce, isMobile, placement },
  ref,
) {
  const id = useId();
  const inputId = `${id}-input`;
  const listboxId = `${id}-listbox`;
  const typoId = `${id}-typo`;
  const helperId = `${id}-helper`;
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef<HTMLButtonElement>(null);

  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [results, setResults] = useState<Suggestions | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const voice = useVoiceCapture();

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    prefill: (text: string) => {
      setValue(text);
      setOpen(true);
      requestAnimationFrame(() => inputRef.current?.focus());
    },
  }));

  /* ------------------------------------------------------- suggestions */

  const query = value.trim();
  useEffect(() => {
    if (query.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ingredients?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!res.ok) return;
        const data = (await res.json()) as { ingredients: Ingredient[]; correction?: Ingredient | null };
        setResults({ query, ingredients: data.ingredients, correction: data.correction ?? null });
        setHighlighted(0);
      } catch {
        // Aborted or offline: Enter still adds the text as typed.
      }
    }, 120);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  // Only results for exactly what's in the box; stale ones are never offered.
  const current = results && results.query === query && query.length >= 2 ? results : null;
  const typo = current !== null && current.ingredients.length === 0;
  const options: Option[] = useMemo(() => {
    if (!current) return [];
    if (!typo) return current.ingredients.map((i) => ({ id: i.id, kind: 'ingredient' as const, value: i.name }));
    const list: Option[] = [];
    if (current.correction) list.push({ id: `fix-${current.correction.id}`, kind: 'correction', value: current.correction.name });
    // The pantry already stores free text (unknown entries are kept and
    // flagged), so "Add anyway" is an existing path, not a new one.
    list.push({ id: 'anyway', kind: 'anyway', value: current.query });
    return list;
  }, [current, typo]);
  const showList = open && options.length > 0 && !voice.active;
  const active = showList ? Math.min(highlighted, options.length - 1) : -1;
  const optionId = (i: number) => `${id}-opt-${i}`;

  const commit = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      onAdd(text, 'typed');
      setValue('');
      setOpen(false);
      setResults(null);
    },
    [onAdd],
  );

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit(showList ? options[active].value : value);
    } else if (e.key === 'ArrowDown' && options.length > 0) {
      e.preventDefault();
      setOpen(true);
      setHighlighted(showList ? (active + 1) % options.length : 0);
    } else if (e.key === 'ArrowUp' && options.length > 0) {
      e.preventDefault();
      setOpen(true);
      setHighlighted(showList ? (active - 1 + options.length) % options.length : options.length - 1);
    } else if (e.key === 'Escape' && showList) {
      // Keep Esc from also closing something further up the page.
      e.stopPropagation();
      setOpen(false);
    }
  }

  /* ----------------------------------------------------------- voice */

  const startVoice = () => {
    setOpen(false);
    setScanOpen(false);
    voice.start();
    announce('Listening…');
  };
  const addHeard = () => {
    const chips = voice.commit();
    if (chips.length > 0) onAddMany(chips.map((c) => c.name));
    inputRef.current?.focus();
  };
  const cancelVoice = () => {
    voice.cancel();
    inputRef.current?.focus();
  };
  useEffect(() => {
    if (voice.error) announce(voice.error);
  }, [voice.error, announce]);

  /* ------------------------------------------------------------- scan */

  const closeScan = useCallback(() => setScanOpen(false), []);

  /* ----------------------------------------------------------- render */

  const placeholder = isMobile ? 'Add an ingredient' : 'Add an ingredient, e.g. garlic';
  const tool =
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-[10px] bg-raised text-foreground hover:bg-border h-11 w-11 lg:h-10 lg:w-auto lg:pl-3 lg:pr-3.5 lg:text-sm lg:font-semibold';

  const describedBy = [typo && showList ? typoId : null, voice.active || voice.error ? helperId : null]
    .filter(Boolean)
    .join(' ') || undefined;

  // Inside the field (desktop) only the first few fit; the rest is "+N" and the
  // full count is on the Add button. Below the field (mobile) they all wrap.
  const inlineChips = isMobile ? voice.chips : voice.chips.slice(0, 2);
  const moreHeard = voice.chips.length - inlineChips.length;
  const chipList = voice.chips.length > 0 && (
    <ul aria-label="Heard so far" className="flex min-w-0 gap-1.5 overflow-hidden">
      {inlineChips.map((chip) => (
        <li
          key={chip.name}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-brand-soft pl-2.5 pr-3 text-sm font-semibold text-brand-strong"
        >
          <Check aria-hidden="true" size={14} />
          {chip.name}
          {chip.quantity > 1 && <span className="font-mono text-xs">×{chip.quantity}</span>}
        </li>
      ))}
      {moreHeard > 0 && (
        <li className="inline-flex h-8 shrink-0 items-center rounded-full bg-brand-soft px-2.5 font-mono text-xs font-semibold text-brand-strong">
          +{moreHeard}
        </li>
      )}
    </ul>
  );

  const helper = (voice.active || voice.error) && (
    <div
      id={helperId}
      className={cn(
        'flex flex-col gap-2 text-sm',
        placement === 'header' && 'absolute inset-x-0 top-full z-40 mt-2 rounded-[14px] border border-border bg-surface p-3 shadow-lg',
        placement === 'hero' && 'mt-2',
      )}
    >
      {isMobile && voice.active && (voice.interim || voice.chips.length > 0) && (
        <>
          {voice.interim && <p className="truncate text-muted">&ldquo;{voice.interim}&rdquo;</p>}
          {voice.chips.length > 0 && <div className="flex flex-wrap gap-1.5 [&_ul]:flex-wrap">{chipList}</div>}
        </>
      )}
      {voice.error ? (
        <p className="text-radish-text">{voice.error}</p>
      ) : (
        <p className="text-muted">Say several at once, like &ldquo;eggs, rice and an onion&rdquo;.</p>
      )}
    </div>
  );

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      onBlur={(e) => {
        // Leaving the whole field (not moving to an option, Speak or Scan)
        // commits what was typed, as the v2 field always has.
        if (containerRef.current?.contains(e.relatedTarget as Node | null)) return;
        setOpen(false);
        if (!voice.active) commit(value);
      }}
    >
      <div
        className={cn(
          'field flex h-14 flex-nowrap items-center gap-2 overflow-hidden rounded-[14px] bg-surface pl-3.5 pr-1.5 md:h-[52px] md:gap-2.5 md:pl-4',
        )}
        onClick={(e) => {
          if (e.target === e.currentTarget) inputRef.current?.focus();
        }}
      >
        {voice.active ? (
          <>
            {voice.listening && (
              <>
                <span
                  aria-hidden="true"
                  className="h-3 w-3 shrink-0 rounded-full bg-radish shadow-[0_0_0_5px_var(--blush)] motion-safe:animate-pulse"
                />
                <span className="shrink-0 font-semibold text-foreground">Listening…</span>
              </>
            )}
            <span className="min-w-0 flex-1 truncate text-muted">
              {!isMobile && voice.interim ? `“${voice.interim}”` : ''}
            </span>
            {!isMobile && chipList && <div className="min-w-0 shrink">{chipList}</div>}
            <Button variant="secondary" className="min-h-10! shrink-0 px-3.5! text-sm sm:min-h-10!" onClick={cancelVoice}>
              Cancel
            </Button>
            <Button
              className="min-h-10! shrink-0 px-4! text-sm sm:min-h-10!"
              disabled={voice.chips.length === 0}
              onClick={addHeard}
            >
              Add {voice.chips.length}
            </Button>
          </>
        ) : (
          <>
            <Search aria-hidden="true" size={20} className="shrink-0 text-muted" />
            <label htmlFor={inputId} className="sr-only">
              Add an ingredient
            </label>
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showList}
              aria-controls={listboxId}
              aria-activedescendant={active >= 0 ? optionId(active) : undefined}
              aria-describedby={describedBy}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setOpen(true);
                voice.clearError();
              }}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              autoComplete="off"
              enterKeyHint="done"
              className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-placeholder md:text-[15px]"
            />
            <span aria-hidden="true" className="h-6 w-px shrink-0 bg-border" />
            {voice.supported && (
              <button type="button" aria-label="Speak" onClick={startVoice} className={tool}>
                <Mic aria-hidden="true" size={18} />
                <span aria-hidden="true" className="hidden lg:inline">
                  Speak
                </span>
              </button>
            )}
            <button
              ref={scanRef}
              type="button"
              aria-label="Scan a barcode"
              aria-haspopup="dialog"
              aria-expanded={scanOpen}
              onClick={() => {
                setOpen(false);
                setScanOpen((v) => !v);
              }}
              className={cn(tool, scanOpen && 'border border-brand bg-brand-soft text-brand-strong hover:bg-brand-soft')}
            >
              <ScanBarcode aria-hidden="true" size={18} />
              <span aria-hidden="true" className="hidden lg:inline">
                Scan
              </span>
            </button>
          </>
        )}
      </div>

      {/* Always in the DOM so aria-controls points at something real. */}
      <div
        hidden={!showList}
        className="absolute inset-x-0 top-full z-50 mt-2 rounded-[14px] border border-border bg-surface p-1.5 shadow-lg"
      >
        {typo && current && (
          <p id={typoId} className="px-3 pb-2 pt-2.5 text-sm text-muted">
            We don&apos;t know &ldquo;{current.query}&rdquo; yet.
          </p>
        )}
        <ul id={listboxId} role="listbox" aria-label="Suggestions" className="flex flex-col gap-0.5">
          {options.map((option, i) => {
            const isActive = i === active;
            return (
              <li
                key={option.id}
                id={optionId(i)}
                role="option"
                aria-selected={isActive}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlighted(i)}
                onClick={() => {
                  commit(option.value);
                  inputRef.current?.focus();
                }}
                className={cn(
                  'flex min-h-12 cursor-pointer items-center gap-3 rounded-[10px] px-3 text-[15px]',
                  isActive ? 'bg-brand-soft text-brand-strong' : option.kind === 'anyway' ? 'text-muted' : 'text-foreground',
                )}
              >
                {option.kind === 'anyway' ? (
                  <Pencil aria-hidden="true" size={18} className="shrink-0" />
                ) : (
                  <Plus aria-hidden="true" size={18} className={cn('shrink-0', !isActive && 'text-muted')} />
                )}
                <span className="min-w-0 flex-1 truncate">
                  {option.kind === 'ingredient' && withMatch(option.value, query)}
                  {option.kind === 'correction' && (
                    <>
                      Did you mean <strong className="font-semibold">{option.value.toLowerCase()}</strong>?
                    </>
                  )}
                  {option.kind === 'anyway' && <>Add &ldquo;{option.value}&rdquo; anyway</>}
                </span>
                {isActive && (
                  <span aria-hidden="true" className="hidden shrink-0 font-mono text-xs md:inline">
                    Enter to add
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <p aria-hidden="true" className="mt-1.5 hidden border-t border-border px-3 pb-1.5 pt-2 font-mono text-xs text-muted md:block">
          ↑ ↓ to move · Enter to add · Esc to close
        </p>
      </div>

      {helper}

      {scanOpen && (
        <ScanPanelB
          variant={isMobile ? 'fullscreen' : 'panel'}
          triggerRef={scanRef}
          onClose={closeScan}
          onAdd={(name, barcode) => onAdd(name, 'scanned', barcode)}
          onSearchInstead={(text) => {
            setScanOpen(false);
            setValue(text);
            setOpen(true);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
        />
      )}
    </div>
  );
});
