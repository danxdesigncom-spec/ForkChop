'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';
import type { GroceryCart, ProviderSummary } from '@/lib/grocery/types';
import type { BasketItem } from '@/components/BasketPanel';
import {
  getFulfilmentServerSnapshot,
  getFulfilmentSnapshot,
  getStoreServerSnapshot,
  getStoreSnapshot,
  setChosenStore,
  setFulfilment,
  subscribeToStore,
  toKrogerModality,
  type ChosenStore,
  type Fulfilment,
} from '@/lib/store-preference';

/** Matches the bound Kroger's cart API and /api/kroger/authorize enforce. */
export const MAX_QUANTITY = 99;

/**
 * The v2 basket's way out: price the basket at the chosen provider and store
 * (POST /api/cart), then either push it into the shopper's real cart through
 * the provider's OAuth hand-off, carrying Pickup or Delivery as Kroger's
 * `modality`, or open the store with the list on the clipboard. Same API
 * calls as v1's BasketPanel; ForkChop never takes payment.
 */
export function useBasketCheckout(items: BasketItem[], providers: ProviderSummary[]) {
  const store = useSyncExternalStore(subscribeToStore, getStoreSnapshot, getStoreServerSnapshot);
  const fulfilment = useSyncExternalStore(subscribeToStore, getFulfilmentSnapshot, getFulfilmentServerSnapshot);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Kroger first when it's available: it's the only provider with a real cart hand-off.
  const provider =
    providers.find((p) => p.id === 'kroger' && p.configured) ?? providers.find((p) => p.configured) ?? null;

  const quantityFor = useCallback((id: string) => quantities[id] ?? 1, [quantities]);

  const setQuantity = useCallback((id: string, next: number) => {
    const clamped = Math.min(MAX_QUANTITY, Math.max(1, Math.round(next)));
    setQuantities((prev) => ({ ...prev, [id]: clamped }));
  }, []);

  const chooseStore = useCallback((next: ChosenStore | null) => {
    setChosenStore(next);
    setError(null);
  }, []);

  const chooseFulfilment = useCallback((next: Fulfilment) => setFulfilment(next), []);

  const send = useCallback(async () => {
    if (!provider || items.length === 0) return;
    setSending(true);
    setError(null);
    const name = provider.name;
    try {
      const res = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((i) => ({
            ingredientId: i.ingredientId,
            quantity: i.quantity,
            unit: i.unit,
            neededFor: i.neededFor,
          })),
          provider: provider.id,
          locationId: store?.locationId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `We couldn't reach ${name}.`);
      const cart = data.cart as GroceryCart;
      if (!cart || cart.items.length === 0) {
        throw new Error(`${name} didn't find any of these items. Try again, or pick another store.`);
      }

      const priced = cart.items.filter((i) => i.offer.priced);
      if (cart.cartHandoffUrl && priced.length > 0) {
        const handoff = await fetch(cart.cartHandoffUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: priced.map((i) => ({ upc: i.offer.sku, quantity: quantityFor(i.offer.ingredientId) })),
            modality: toKrogerModality(fulfilment),
          }),
        });
        const next = await handoff.json().catch(() => ({}));
        if (!handoff.ok || !next.authorizeUrl) throw new Error(next.error ?? `We couldn't start the hand-off to ${name}.`);
        // Same tab on purpose: this sign-in has to come back to our callback.
        window.location.href = next.authorizeUrl as string;
        return;
      }

      // No cart hand-off here: open the store with the list on the clipboard.
      if (cart.clipboardText) {
        try {
          await navigator.clipboard.writeText(cart.clipboardText);
        } catch {
          // Clipboard refused; the store still opens.
        }
      }
      window.location.href = cart.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : `Something went wrong sending your basket to ${name}.`);
      setSending(false);
    }
  }, [provider, items, store, fulfilment, quantityFor]);

  return {
    provider,
    store,
    chooseStore,
    fulfilment,
    chooseFulfilment,
    quantityFor,
    setQuantity,
    send,
    sending,
    error,
  };
}
