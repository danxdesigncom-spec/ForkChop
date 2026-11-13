'use client';

import { Mic, ScanBarcode, Search } from 'lucide-react';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { HaveChip } from './HaveChip';
import { cn } from './cn';

interface Props {
  /** Names already in the kitchen, shown as chips inside the field. */
  have: string[];
  /** Raw text the shopper committed (Enter or comma). Parsing stays with the caller. */
  onAdd: (raw: string) => void;
  onRemove: (name: string) => void;
  onScan?: () => void;
  onSpeak?: () => void;
  placeholder?: string;
  /** Header version: shorter, and chips past `maxChips` collapse. */
  compact?: boolean;
  maxChips?: number;
  /** Rendered after the visible chips, e.g. a "+N more" popover trigger. */
  overflow?: React.ReactNode;
  label?: string;
}

/**
 * The v2 ingredient input. A visual shell only: what the text means (typo
 * suggestions, resolution) stays with the existing pantry logic, which the
 * caller wires in through `onAdd`. Scan and Speak are icon buttons that the
 * caller connects to the existing BarcodeScanner and VoiceInput behaviour.
 *
 * Enter or comma adds. Backspace in an empty input removes the last chip.
 */
export function IngredientField({
  have,
  onAdd,
  onRemove,
  onScan,
  onSpeak,
  placeholder = 'Add an ingredient…',
  compact,
  maxChips,
  overflow,
  label = 'Add an ingredient',
}: Props) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const shown = maxChips !== undefined ? have.slice(0, maxChips) : have;

  function commit() {
    const raw = value.trim();
    if (!raw) return;
    onAdd(raw);
    setValue('');
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && value === '' && have.length > 0) {
      e.preventDefault();
      onRemove(have[have.length - 1]);
    }
  }

  return (
    <div
      className={cn(
        'field flex flex-wrap items-center gap-2 rounded-[14px] bg-surface pl-3.5 pr-1.5',
        compact ? 'min-h-[52px] py-1.5' : 'min-h-16 rounded-[18px] py-2',
      )}
      onClick={(e) => {
        // Clicking the field's padding focuses the input, like a native field.
        if (e.target === e.currentTarget) inputRef.current?.focus();
      }}
    >
      <Search aria-hidden="true" size={20} className="shrink-0 text-muted" />
      {shown.map((name) => (
        <HaveChip key={name} name={name} onRemove={onRemove} />
      ))}
      {overflow}
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder={have.length > 0 ? 'Add more…' : placeholder}
        autoComplete="off"
        enterKeyHint="done"
        className="min-w-20 flex-1 self-stretch bg-transparent text-[15px] text-foreground outline-none"
      />
      {onScan && (
        <button
          type="button"
          aria-label="Scan a barcode"
          onClick={onScan}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-raised text-foreground"
        >
          <ScanBarcode aria-hidden="true" size={20} />
        </button>
      )}
      {onSpeak && (
        <button
          type="button"
          aria-label="Add by voice"
          onClick={onSpeak}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-raised text-foreground"
        >
          <Mic aria-hidden="true" size={20} />
        </button>
      )}
    </div>
  );
}
