'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { Button } from './Button';
import { HaveChip } from './HaveChip';
import { useDismiss } from './use-dismiss';

interface Props {
  have: string[];
  /** How many chips are already visible next to the trigger. */
  hiddenCount: number;
  onRemove: (name: string) => void;
  onClearAll: () => void;
}

/**
 * The "Your kitchen" body: count line, every chip, Clear all and Done. Shared
 * by the desktop popover below and, in v2B, the mobile tray's Edit sheet.
 */
export function YourKitchenBody({
  have,
  onRemove,
  onClearAll,
  onDone,
}: {
  have: string[];
  onRemove: (name: string) => void;
  onClearAll: () => void;
  onDone: () => void;
}) {
  return (
    <>
      <p className="text-[13px] text-muted">
        {have.length} {have.length === 1 ? 'ingredient' : 'ingredients'} · remove anything that&apos;s run out
      </p>
      <div className="mt-3 flex max-h-64 flex-wrap gap-2 overflow-y-auto">
        {have.map((name) => (
          <HaveChip key={name} name={name} onRemove={onRemove} />
        ))}
      </div>
      <div className="mt-4 flex justify-between gap-2">
        <Button variant="ghost" onClick={onClearAll}>
          Clear all
        </Button>
        <Button onClick={onDone}>Done</Button>
      </div>
    </>
  );
}

/** Desktop: "+N more" opens every kitchen chip, with Clear all and Done. */
export function YourKitchenPopover({ have, hiddenCount, onRemove, onClearAll }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const headingId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, panel, trigger);

  if (hiddenCount <= 0) return null;

  return (
    <div className="relative">
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-8 items-center whitespace-nowrap rounded-full border border-line-strong px-3 text-sm font-semibold text-foreground"
      >
        +{hiddenCount} more
      </button>
      <div
        ref={panel}
        id={id}
        role="group"
        aria-labelledby={headingId}
        hidden={!open}
        className="absolute left-0 top-full z-50 mt-2 w-80 rounded-2xl border border-border bg-surface p-4 shadow-lg"
      >
        <h2 id={headingId} className="font-display text-lg font-semibold text-foreground">
          Your kitchen
        </h2>
        <YourKitchenBody
          have={have}
          onRemove={onRemove}
          onClearAll={() => {
            onClearAll();
            close();
            trigger.current?.focus();
          }}
          onDone={() => {
            close();
            trigger.current?.focus();
          }}
        />
      </div>
    </div>
  );
}

/** Mobile: a "Show all N" toggle that expands the chip list in place. */
export function YourKitchenList({
  have,
  collapsedCount = 6,
  onRemove,
}: {
  have: string[];
  collapsedCount?: number;
  onRemove: (name: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const shown = expanded ? have : have.slice(0, collapsedCount);
  return (
    <div>
      <ul id={id} className="flex flex-wrap gap-2">
        {shown.map((name) => (
          <li key={name}>
            <HaveChip name={name} onRemove={onRemove} />
          </li>
        ))}
      </ul>
      {have.length > collapsedCount && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-brand-strong"
        >
          {expanded ? 'Show fewer' : `Show all ${have.length}`}
        </button>
      )}
    </div>
  );
}
