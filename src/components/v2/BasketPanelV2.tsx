'use client';

import { ArrowRight, Minus, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { SegmentedControl } from './SegmentedControl';
import { Sheet } from './Sheet';

export type { Fulfilment } from '@/lib/store-preference';
import type { Fulfilment } from '@/lib/store-preference';

export interface BasketLine {
  /** Stable key, usually the ingredient id. */
  id: string;
  name: string;
  /** Recipe this was added for, shown as "For …". */
  forRecipe?: string;
  quantity: number;
}

export interface BasketViewProps {
  lines: BasketLine[];
  onQuantity: (id: string, quantity: number) => void;
  fulfilment: Fulfilment;
  onFulfilment: (value: Fulfilment) => void;
  /** e.g. "Kroger" — the provider the Send button hands off to. */
  providerName: string;
  /** e.g. "Food 4 Less · Highland Center". */
  storeLabel?: ReactNode;
  /** Store picker or other provider controls, from the existing basket logic. */
  storeSlot?: ReactNode;
  onSend: () => void;
  sending?: boolean;
  /** Shown under the basket when the hand-off fails. */
  error?: string | null;
}

const FULFILMENT = [
  { value: 'pickup' as const, label: 'Pickup' },
  { value: 'delivery' as const, label: 'Delivery' },
];

function Lines({ lines, onQuantity }: Pick<BasketViewProps, 'lines' | 'onQuantity'>) {
  return (
    <ul className="flex flex-col">
      {lines.map((line) => (
        <li key={line.id} className="flex items-center gap-3 border-b border-raised py-3 last:border-b-0">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-semibold text-foreground">{line.name}</span>
            {line.forRecipe && <span className="truncate text-[13px] text-muted">For {line.forRecipe}</span>}
          </div>
          <div className="flex items-center rounded-[10px] border border-border">
            <button
              type="button"
              aria-label={line.quantity <= 1 ? `Remove ${line.name}` : `Decrease ${line.name} quantity`}
              onClick={() => onQuantity(line.id, line.quantity - 1)}
              className="inline-flex h-10 w-9 items-center justify-center text-foreground"
            >
              {line.quantity <= 1 ? <Trash2 aria-hidden="true" size={14} /> : <Minus aria-hidden="true" size={14} />}
            </button>
            <span className="w-5 text-center font-mono text-sm" aria-label={`${line.name} quantity ${line.quantity}`}>
              {line.quantity}
            </span>
            <button
              type="button"
              aria-label={`Increase ${line.name} quantity`}
              onClick={() => onQuantity(line.id, line.quantity + 1)}
              className="inline-flex h-10 w-9 items-center justify-center text-foreground"
            >
              <Plus aria-hidden="true" size={14} />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Body(props: BasketViewProps & { emptyReasonId: string }) {
  const { lines, onQuantity, fulfilment, onFulfilment, storeLabel, storeSlot, error } = props;
  if (lines.length === 0) {
    return (
      <EmptyState expression="thinking" heading="Nothing in here yet">
        <p id={props.emptyReasonId}>Tap a missing ingredient on any recipe to add it here.</p>
      </EmptyState>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <Lines lines={lines} onQuantity={onQuantity} />
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-muted">How do you want it?</span>
        <SegmentedControl label="Fulfilment" options={FULFILMENT} value={fulfilment} onChange={onFulfilment} />
        {storeLabel && <span className="text-[13px] text-muted">{storeLabel}</span>}
        {storeSlot}
      </div>
      {error && (
        <p role="alert" className="text-sm text-radish-text">
          {error}
        </p>
      )}
    </div>
  );
}

function Send({ lines, providerName, onSend, sending, emptyReasonId }: BasketViewProps & { emptyReasonId: string }) {
  const empty = lines.length === 0;
  return (
    <div className="flex flex-col gap-3">
      <Button
        block
        disabled={empty || sending}
        disabledReasonId={empty ? emptyReasonId : undefined}
        onClick={onSend}
        trailingIcon={<ArrowRight size={20} />}
      >
        {sending ? `Sending to ${providerName}…` : `Send to ${providerName}`}
      </Button>
      <p className="flex gap-2 text-xs leading-normal text-muted">
        <ShieldCheck aria-hidden="true" size={16} className="shrink-0" />
        You&apos;ll check out on {providerName}. ForkChop never sees payment details.
      </p>
    </div>
  );
}

/** Desktop basket: a sticky aside. Cart and pricing logic stay with the caller. */
export function BasketPanelV2(props: BasketViewProps) {
  const emptyReasonId = useId();
  const count = props.lines.reduce((n, l) => n + l.quantity, 0);
  return (
    <aside
      aria-label="Basket"
      className="sticky top-6 flex w-[340px] shrink-0 flex-col gap-5 self-start rounded-[20px] border border-border bg-surface p-6"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-semibold text-foreground">Your basket</h2>
        <span className="inline-flex h-6 items-center rounded-full bg-raised px-2.5 font-mono text-[13px] font-semibold text-foreground">
          {count} {count === 1 ? 'item' : 'items'}
        </span>
      </div>
      <Body {...props} emptyReasonId={emptyReasonId} />
      <Send {...props} emptyReasonId={emptyReasonId} />
    </aside>
  );
}

/** Mobile basket: the same content in a bottom sheet. */
export function BasketSheet(props: BasketViewProps & { open: boolean; onClose: () => void }) {
  const emptyReasonId = useId();
  return (
    <Sheet open={props.open} onClose={props.onClose} title="Your basket" footer={<Send {...props} emptyReasonId={emptyReasonId} />}>
      <Body {...props} emptyReasonId={emptyReasonId} />
    </Sheet>
  );
}
