'use client';

import { Refrigerator } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { layoutTray } from '@/lib/v2/kitchen-tray';
import { Button } from './Button';
import { HaveChip } from './HaveChip';
import { Sheet } from './Sheet';
import { YourKitchenBody } from './YourKitchenPopover';
import { cn } from './cn';

/**
 * v2B "Your kitchen" tray (docs/redesign/07-ingredient-bar-b.md §3): the
 * chips' home now that the field is only for adding.
 *
 * - ≥768px: a strip that wraps, capped at two rows. Past that, the last slot
 *   is "Show all N", which expands the tray in place.
 * - <768px: one row that scrolls sideways, plus Edit, which opens the "Your
 *   kitchen" sheet for bulk removal.
 *
 * Removing a chip moves focus to the next one (or the previous one at the end
 * of the list), or to the field via `onEmpty` when none are left.
 */

interface Props {
  have: string[];
  onRemove: (name: string) => void;
  onClearAll: () => void;
  /** Names to ring briefly because they were just added. */
  highlighted: ReadonlySet<string>;
  /** Called after removing the last chip, to focus the field. */
  onEmpty: () => void;
  isMobile: boolean;
  /** `bar`: full-width strip under the header. `inline`: inside the Home hero. */
  placement?: 'bar' | 'inline';
  /** The status message with Undo (§6), shown under the chips. */
  status?: ReactNode;
}

const GAP = 6;
const ROWS = 2;

export function KitchenTray({ have, onRemove, onClearAll, highlighted, onEmpty, isMobile, placement = 'bar', status }: Props) {
  const headingId = useId();
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const focusAfterRemove = useRef<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  // Remove, then put focus somewhere sensible once the list has re-rendered.
  const remove = (name: string) => {
    focusAfterRemove.current = have.indexOf(name);
    onRemove(name);
  };
  useEffect(() => {
    const index = focusAfterRemove.current;
    if (index === null) return;
    focusAfterRemove.current = null;
    if (have.length === 0) {
      onEmpty();
      return;
    }
    const target = Math.min(index, have.length - 1);
    const list = listRef.current;
    // The next chip may be collapsed behind "Show all N"; then that button.
    const next =
      list?.querySelector<HTMLButtonElement>(`[data-chip-index="${target}"] button`) ??
      list?.querySelector<HTMLButtonElement>('button[aria-expanded]');
    if (next) next.focus();
    else onEmpty();
  }, [have, onEmpty]);

  const count = (
    <span className="rounded-full bg-raised px-2 py-0.5 font-mono text-xs tabular-nums text-muted">{have.length}</span>
  );

  if (isMobile) {
    return (
      <section
        aria-labelledby={headingId}
        className={cn('border-b border-border py-3.5', placement === 'inline' && 'w-full rounded-[20px] border bg-surface')}
      >
        <div className="flex items-center justify-between pb-1.5 pl-4 pr-2">
          <h2 id={headingId} className="text-sm font-semibold text-muted">
            Your kitchen · {have.length}
          </h2>
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="inline-flex min-h-11 items-center rounded-[10px] px-2.5 text-sm font-semibold text-brand"
          >
            Edit
          </button>
        </div>
        <ul
          ref={listRef}
          aria-label="In your kitchen"
          className="flex snap-x snap-proximity scroll-px-4 gap-1.5 overflow-x-auto px-4 [mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {have.map((name, i) => (
            <li key={name} data-chip-index={i} className="shrink-0 snap-start">
              <HaveChip name={name} onRemove={remove} size="lg" highlighted={highlighted.has(name)} />
            </li>
          ))}
          {/* Lets the last chip scroll clear of the fade. */}
          <li aria-hidden="true" className="w-6 shrink-0" />
        </ul>
        {status && <div className="px-4 pt-3">{status}</div>}
        <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="Your kitchen">
          <YourKitchenBody
            have={have}
            onRemove={onRemove}
            onClearAll={() => {
              onClearAll();
              setEditOpen(false);
            }}
            onDone={() => setEditOpen(false)}
          />
        </Sheet>
      </section>
    );
  }

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        placement === 'bar' ? 'border-y border-border bg-surface' : 'w-full rounded-[20px] border border-border bg-surface',
      )}
    >
      <div className={cn('mx-auto flex max-w-6xl items-start gap-4 py-3', placement === 'bar' ? 'px-4' : 'px-4')}>
        <h2 id={headingId} className="inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap text-sm font-semibold text-foreground">
          <Refrigerator aria-hidden="true" size={18} className="text-brand" />
          Your kitchen
          {count}
        </h2>
        <WrappingChips
          have={have}
          listId={listId}
          listRef={listRef}
          onRemove={remove}
          highlighted={highlighted}
        />
        <Button variant="ghost" className="min-h-8! shrink-0 px-3! text-sm text-radish-text hover:bg-blush sm:min-h-8!" onClick={onClearAll}>
          Clear all
        </Button>
      </div>
      {status && <div className="mx-auto max-w-6xl px-4 pb-3">{status}</div>}
    </section>
  );
}

/**
 * The desktop chip list. A hidden row of look-alike chips is measured so the
 * real list can stop at two rows without first rendering and then jumping.
 */
function WrappingChips({
  have,
  listId,
  listRef,
  onRemove,
  highlighted,
}: {
  have: string[];
  listId: string;
  listRef: React.RefObject<HTMLUListElement | null>;
  onRemove: (name: string) => void;
  highlighted: ReadonlySet<string>;
}) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [widths, setWidths] = useState<number[]>([]);
  const [moreWidth, setMoreWidth] = useState(96);
  const [expanded, setExpanded] = useState(false);

  // Track the list's width.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [listRef]);

  // Measure every chip (and the button) whenever the names change.
  useLayoutEffect(() => {
    const box = measureRef.current;
    if (!box) return;
    const chips = Array.from(box.querySelectorAll<HTMLElement>('[data-measure="chip"]'));
    setWidths(chips.map((c) => c.getBoundingClientRect().width));
    const more = box.querySelector<HTMLElement>('[data-measure="more"]');
    if (more) setMoreWidth(more.getBoundingClientRect().width);
  }, [have]);

  const layout = layoutTray(widths.length === have.length ? widths : [], { width, gap: GAP, rows: ROWS, moreWidth });
  const collapsed = !expanded && layout.hidden > 0;
  const shown = collapsed ? have.slice(0, layout.visible) : have;
  const showToggle = layout.hidden > 0 || expanded;

  return (
    <div className="relative min-w-0 flex-1">
      <ul ref={listRef} id={listId} aria-label="In your kitchen" className="flex flex-wrap gap-1.5">
        {shown.map((name, i) => (
          <li key={name} data-chip-index={i}>
            <HaveChip name={name} onRemove={onRemove} highlighted={highlighted.has(name)} />
          </li>
        ))}
        {showToggle && (
          <li>
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex min-h-8 items-center whitespace-nowrap rounded-full border border-line-strong px-3 text-sm font-semibold text-foreground hover:bg-raised"
            >
              {expanded ? 'Show fewer' : `Show all ${have.length}`}
            </button>
          </li>
        )}
      </ul>
      {/* Look-alike chips for measuring only: no buttons, never seen or read. */}
      <div ref={measureRef} aria-hidden="true" className="invisible absolute left-0 top-0 flex h-0 overflow-hidden whitespace-nowrap">
        {have.map((name) => (
          <span
            key={name}
            data-measure="chip"
            className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full py-1 pl-3 pr-1.5 text-sm font-medium"
          >
            {name}
            <span className="inline-block h-6 w-6" />
          </span>
        ))}
        <span data-measure="more" className="inline-flex min-h-8 shrink-0 items-center rounded-full border px-3 text-sm font-semibold">
          Show all {have.length}
        </span>
      </div>
    </div>
  );
}
