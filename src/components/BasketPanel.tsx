'use client';

import { useMemo, useState } from 'react';
import type { GroceryCart, GroceryCartItem, ProviderSummary } from '@/lib/grocery/types';
import { formatMoney } from '@/lib/format';
import { DEPARTMENT_ORDER, departmentIcon } from '@/lib/grocery/departments';
import { ShoppingListExport } from './ShoppingListExport';

export interface BasketItem {
  ingredientId: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  neededFor: string[];
  /** Ingredient category, so the list can be grouped without a provider. */
  category?: string;
}

/** The always-available "no storefront" choice, alongside the real providers. */
const EXPORT_OPTION = 'list';

const PROVIDER_EMOJI: Record<string, string> = {
  instacart: '🥕',
  kroger: '🛒',
};

interface Props {
  items: BasketItem[];
  providers: ProviderSummary[];
  onRemove: (ingredientId: string) => void;
  onClear: () => void;
}

/**
 * The shopping side of ForkChop.
 *
 * Three ways out: a connected storefront (which prices the basket and hands off
 * for payment), a partner that is not connected yet (which says so rather than
 * pretending), or an exportable shopping list that always works.
 */
export function BasketPanel({ items, providers, onRemove, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<string>(EXPORT_OPTION);
  const [cart, setCart] = useState<GroceryCart | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handoffPending, setHandoffPending] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);

  /**
   * Hand the priced basket to the store's OAuth flow.
   *
   * The UPCs are POSTed so they never appear in a URL, and the server replies
   * with the store's consent URL. Navigation is same-tab on purpose: this is a
   * sign-in flow that has to come back to our callback, and popup blockers eat
   * `window.open` when it follows an await.
   */
  const sendToStoreCart = async (current: GroceryCart) => {
    if (!current.cartHandoffUrl) return;
    setHandoffPending(true);
    setHandoffError(null);
    try {
      const res = await fetch(current.cartHandoffUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: current.items
            .filter((i) => i.offer.priced)
            .map((i) => ({ upc: i.offer.sku, quantity: i.quantity })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.authorizeUrl) {
        throw new Error(data.error ?? 'Could not start the handoff.');
      }
      window.location.href = data.authorizeUrl as string;
    } catch (err) {
      setHandoffError(
        err instanceof Error
          ? `${err.message} You can still copy the list and continue below.`
          : 'Something went wrong. You can still copy the list below.',
      );
      setHandoffPending(false);
    }
  };

  const selectedProvider = providers.find((p) => p.id === choice);

  const groups = useMemo(() => {
    if (!cart) return [];

    const order = cart.departmentOrder?.length ? cart.departmentOrder : DEPARTMENT_ORDER;
    const rank = new Map(order.map((name, index) => [name, index]));

    const byDepartment = new Map<string, GroceryCartItem[]>();
    for (const item of cart.items) {
      const department = item.offer.department || 'Other';
      const list = byDepartment.get(department) ?? [];
      list.push(item);
      byDepartment.set(department, list);
    }

    return [...byDepartment.entries()]
      .map(([department, groupItems]) => ({
        department,
        items: groupItems,
        subtotalCents: groupItems.reduce((sum, i) => sum + i.lineTotalCents, 0),
        // A group where nothing could be priced shows a dash, not $0.00 —
        // same reasoning as the individual lines.
        hasPricedItem: groupItems.some((i) => i.offer.priced !== false),
      }))
      .sort(
        (a, b) =>
          (rank.get(a.department) ?? order.length) - (rank.get(b.department) ?? order.length) ||
          a.department.localeCompare(b.department),
      );
  }, [cart]);

  const priceUp = async (providerId: string) => {
    setLoading(true);
    setError(null);
    setCart(null);
    try {
      const res = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, provider: providerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not price up the basket');
      setCart(data.cart as GroceryCart);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const select = (id: string) => {
    setChoice(id);
    setCart(null);
    setError(null);
    if (id !== EXPORT_OPTION) {
      const provider = providers.find((p) => p.id === id);
      if (provider?.configured) void priceUp(id);
    }
  };

  if (items.length === 0) return null;

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {items.length} missing ingredient{items.length === 1 ? '' : 's'} in your basket
            </p>
            <p className="truncate text-xs text-muted">{items.map((i) => i.name).join(', ')}</p>
          </div>

          <button type="button" onClick={onClear} className="text-xs text-muted hover:text-foreground">
            Clear
          </button>

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-strong"
          >
            Check out
          </button>
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="basket-title"
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-surface sm:rounded-2xl"
          >
            <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-surface p-5">
              <div>
                <h2 id="basket-title" className="text-lg font-bold">
                  Your basket
                </h2>
                <p className="text-xs text-muted">
                  {items.length} item{items.length === 1 ? '' : 's'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close basket"
                className="rounded-lg px-2 py-1 text-muted hover:bg-surface-muted hover:text-foreground"
              >
                ✕
              </button>
            </header>

            <div className="border-b border-border p-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
                How do you want to shop?
              </p>
              <div className="grid gap-2">
                {providers.map((provider) => (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => select(provider.id)}
                    aria-pressed={choice === provider.id}
                    className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-colors
                      ${
                        choice === provider.id
                          ? 'border-brand bg-brand-soft'
                          : 'border-border hover:border-brand'
                      }`}
                  >
                    <span aria-hidden className="text-lg">
                      {PROVIDER_EMOJI[provider.id] ?? '🛒'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{provider.name}</span>
                      <span className="block text-xs text-muted">
                        {provider.configured
                          ? (provider.deliveryNote ?? 'Order for delivery')
                          : 'Not connected in this build'}
                      </span>
                    </span>
                    {!provider.configured && (
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                        style={{
                          backgroundColor: 'var(--score-mid-soft)',
                          color: 'var(--score-mid)',
                        }}
                      >
                        Setup
                      </span>
                    )}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => select(EXPORT_OPTION)}
                  aria-pressed={choice === EXPORT_OPTION}
                  className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-colors
                    ${
                      choice === EXPORT_OPTION
                        ? 'border-brand bg-brand-soft'
                        : 'border-border hover:border-brand'
                    }`}
                >
                  <span aria-hidden className="text-lg">
                    📝
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">Shopping list</span>
                    <span className="block text-xs text-muted">
                      Print, screenshot, copy or download — no account needed
                    </span>
                  </span>
                </button>
              </div>
            </div>

            <div className="p-4">
              {choice === EXPORT_OPTION && <ShoppingListExport items={items} />}

              {choice !== EXPORT_OPTION && selectedProvider && !selectedProvider.configured && (
                <div className="rounded-xl border border-border bg-surface-muted p-4 text-sm">
                  <p className="font-semibold">{selectedProvider.name} isn&apos;t connected yet</p>
                  <p className="mt-1 text-muted">
                    {`Ordering through ${selectedProvider.name} needs partner API credentials, which this build doesn't have. Rather than show a checkout button that quietly does nothing, ForkChop says so.`}
                  </p>
                  {selectedProvider.setupHint && (
                    <p className="mt-2 rounded-lg bg-surface p-2 font-mono text-xs text-muted">
                      {selectedProvider.setupHint}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => select(EXPORT_OPTION)}
                    className="mt-3 w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-strong"
                  >
                    Use the shopping list instead
                  </button>
                </div>
              )}

              {choice !== EXPORT_OPTION && loading && (
                <p className="py-6 text-center text-sm text-muted">Pricing your basket…</p>
              )}

              {error && (
                <p role="alert" className="text-sm text-score-mid">
                  {error}
                </p>
              )}

              {choice !== EXPORT_OPTION && cart && (
                <>
                  {groups.map((group) => (
                    <section key={group.department} className="mb-3">
                      <h3 className="mb-1 flex items-center justify-between gap-2 border-b border-border pb-1">
                        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide">
                          <span aria-hidden>{departmentIcon(group.department)}</span>
                          {group.department}
                          <span className="font-normal text-muted">({group.items.length})</span>
                        </span>
                        <span className="text-xs font-semibold tabular-nums text-muted">
                          {group.hasPricedItem
                            ? formatMoney(group.subtotalCents, cart.currency)
                            : '—'}
                        </span>
                      </h3>

                      <ul className="divide-y divide-border">
                        {group.items.map((item) => (
                          <li key={item.offer.sku} className="flex items-start gap-3 py-2.5">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium">{item.offer.title}</p>
                              <p className="text-xs text-muted">
                                {item.offer.brand} · {item.offer.size}
                              </p>
                              {item.neededFor.length > 0 && (
                                <p className="mt-0.5 text-xs text-muted">
                                  For: {item.neededFor.join(', ')}
                                </p>
                              )}
                            </div>
                            <div className="text-right">
                              {/*
                                An unpriced line shows a dash, never $0.00 —
                                "we couldn't price this" and "this is free"
                                must not look the same.
                               */}
                              <p className="text-sm tabular-nums">
                                {item.offer.priced === false
                                  ? '—'
                                  : formatMoney(item.lineTotalCents, cart.currency)}
                              </p>
                              {item.offer.onPromotion && (
                                <p className="text-[10px] font-bold uppercase text-score-high">
                                  On offer
                                </p>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  onRemove(item.offer.ingredientId);
                                  setCart(null);
                                }}
                                className="text-xs text-muted hover:text-brand"
                              >
                                Remove
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}

                  {cart.unavailable.length > 0 && (
                    <div className="rounded-lg bg-score-mid-soft p-3 text-xs text-score-mid">
                      Out of stock: {cart.unavailable.map((i) => i.name).join(', ')}
                    </div>
                  )}

                  <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
                    <div className="flex justify-between text-muted">
                      <span>Subtotal</span>
                      <span className="tabular-nums">
                        {formatMoney(cart.subtotalCents, cart.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted">
                      <span>Delivery</span>
                      <span className="tabular-nums">
                        {cart.deliveryFeeCents === 0
                          ? 'Free'
                          : formatMoney(cart.deliveryFeeCents, cart.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between pt-1.5 font-semibold">
                      <span className="flex items-center gap-1.5">
                        Total
                        {cart.priceDisclaimer && (
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase"
                            style={{
                              backgroundColor: 'var(--score-mid-soft)',
                              color: 'var(--score-mid)',
                            }}
                          >
                            Est.
                          </span>
                        )}
                      </span>
                      <span className="tabular-nums">
                        {formatMoney(cart.totalCents, cart.currency)}
                      </span>
                    </div>
                    <p className="pt-1 text-xs text-muted">
                      Estimated delivery {cart.estimatedDelivery}
                    </p>
                  </div>

                  {/*
                    Money the shopper might budget against must never look more
                    certain than it is. The provider decides the wording; the UI
                    only guarantees it appears next to the total.
                   */}
                  {cart.priceDisclaimer && (
                    <div className="mt-3 rounded-lg bg-score-mid-soft p-3 text-xs text-score-mid">
                      <p className="font-semibold">{cart.priceDisclaimer}</p>
                      {typeof cart.pricedItemCount === 'number' &&
                        cart.pricedItemCount < cart.items.length && (
                          <p className="mt-1">
                            Priced {cart.pricedItemCount} of {cart.items.length} items — the rest
                            weren&apos;t matched to a product and aren&apos;t counted in the total.
                          </p>
                        )}
                    </div>
                  )}

                  {/*
                    When the provider hands over a `clipboardText` (Kroger,
                    because their site can't accept a full list via URL), copy
                    it to the clipboard just before the tab opens. Clipboard
                    writes must run from a user gesture, so the anchor is
                    swapped for a button — a plain anchor's default
                    navigation would race the async copy.
                   */}
                  {/*
                    The best available handoff: put the items straight into the
                    shopper's store account so they don't re-pick everything.
                    Only offered when the provider priced real SKUs, since
                    that's where the UPCs come from. Falls back to the deep link
                    below if the store refuses (consent declined, scope not
                    granted) — see /api/kroger/callback.
                   */}
                  {cart.cartHandoffUrl && (
                    <button
                      type="button"
                      disabled={handoffPending}
                      onClick={() => void sendToStoreCart(cart)}
                      className="mt-4 block w-full rounded-xl bg-brand px-4 py-3 text-center text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60"
                    >
                      {handoffPending
                        ? 'Opening…'
                        : `Add ${cart.pricedItemCount ?? cart.items.length} items to my ${cart.providerName} cart`}
                    </button>
                  )}

                  {handoffError && (
                    <p role="alert" className="mt-2 text-xs text-score-mid">
                      {handoffError}
                    </p>
                  )}

                  {cart.clipboardText ? (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(cart.clipboardText!);
                        } catch {
                          // If the browser refuses the copy (permission or
                          // insecure context) the handoff should still happen.
                        }
                        window.open(cart.checkoutUrl, '_blank', 'noopener,noreferrer');
                      }}
                      className={`mt-2 block w-full rounded-xl px-4 py-3 text-center text-sm font-semibold ${
                        cart.cartHandoffUrl
                          ? 'border-2 border-border hover:border-brand hover:text-brand'
                          : 'bg-brand text-white hover:bg-brand-strong'
                      }`}
                    >
                      Copy list & continue to {cart.providerName}
                    </button>
                  ) : (
                    <a
                      href={cart.checkoutUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 block w-full rounded-xl bg-brand px-4 py-3 text-center text-sm font-semibold text-white hover:bg-brand-strong"
                    >
                      Continue to {cart.providerName}
                    </a>
                  )}
                  <p className="mt-2 text-center text-xs text-muted">
                    {cart.clipboardText
                      ? `Your list is on the clipboard — paste it into ${cart.providerName}'s search or cart. ForkChop never takes payment details.`
                      : 'You complete payment on the store’s own site. ForkChop never takes payment details.'}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
