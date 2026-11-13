import { describe, expect, it } from 'vitest';
import { createKrogerProvider } from '@/lib/grocery/kroger-provider';

const categories = new Map<string, string>([
  ['tahini', 'condiment'],
  ['lemon', 'produce'],
]);

const items = [
  { ingredientId: 'tahini', name: 'Tahini', quantity: 1, unit: null, neededFor: ['Hummus'] },
  { ingredientId: 'lemon', name: 'Lemon', quantity: 2, unit: 'each', neededFor: ['Hummus'] },
];

const provider = createKrogerProvider(categories);

describe('Kroger provider — configuration', () => {
  it('is always configured — no key required', () => {
    // Kroger's URL scheme is public. Deliberately different from Instacart.
    expect(provider.configured).toBe(true);
  });
});

describe('Kroger provider — deep-link shape', () => {
  it('points at kroger.com search for the first item', async () => {
    const cart = await provider.createCart(items);
    expect(cart.checkoutUrl).toBe('https://www.kroger.com/search?query=Tahini');
  });

  it('URL-encodes items containing spaces or special characters', async () => {
    const cart = await provider.createCart([
      { ingredientId: 'x', name: 'Chicken breast', quantity: 1, unit: null, neededFor: [] },
    ]);
    // URLSearchParams uses + rather than %20 for spaces, matching kroger.com.
    expect(cart.checkoutUrl).toBe('https://www.kroger.com/search?query=Chicken+breast');
  });

  it('falls back to the cart home when the basket is empty', async () => {
    const cart = await provider.createCart([]);
    expect(cart.checkoutUrl).toBe('https://www.kroger.com/cart');
  });
});

describe('Kroger provider — clipboard payload', () => {
  it('sends a plain-text list, one item per line', async () => {
    const cart = await provider.createCart(items);
    expect(cart.clipboardText).toBe('1 Tahini\n2 each Lemon');
  });

  it('handles missing quantities and units without extra whitespace', async () => {
    const cart = await provider.createCart([
      { ingredientId: 'x', name: 'Salt', quantity: null, unit: null, neededFor: [] },
    ]);
    expect(cart.clipboardText).toBe('Salt');
  });

  it('is empty for an empty basket', async () => {
    const cart = await provider.createCart([]);
    expect(cart.clipboardText).toBe('');
  });
});

describe('Kroger provider — cart shape', () => {
  it('echoes items with priceCents 0 — no invented totals', async () => {
    const cart = await provider.createCart(items);
    expect(cart.providerId).toBe('kroger');
    expect(cart.items).toHaveLength(2);
    expect(cart.subtotalCents).toBe(0);
    expect(cart.totalCents).toBe(0);
    // The picker UI already handles zero; we don't fabricate numbers we
    // haven't been told.
  });
});

describe('Kroger cart hand-off: modality', () => {
  it('defaults the hand-off to PICKUP and stamps every line', async () => {
    const { KrogerHandoffSchema, toCartLines } = await import('@/lib/grocery/kroger-cart');
    const parsed = KrogerHandoffSchema.parse({
      items: [
        { upc: '0001111041700', quantity: 2 },
        { upc: '0001111060933' },
      ],
    });
    expect(toCartLines(parsed)).toEqual([
      { upc: '0001111041700', quantity: 2, modality: 'PICKUP' },
      { upc: '0001111060933', quantity: 1, modality: 'PICKUP' },
    ]);
  });

  it('carries DELIVERY through when chosen', async () => {
    const { KrogerHandoffSchema, toCartLines } = await import('@/lib/grocery/kroger-cart');
    const parsed = KrogerHandoffSchema.parse({ items: [{ upc: '1', quantity: 1 }], modality: 'DELIVERY' });
    expect(toCartLines(parsed)[0].modality).toBe('DELIVERY');
  });

  it('rejects an invalid modality', async () => {
    const { KrogerHandoffSchema } = await import('@/lib/grocery/kroger-cart');
    for (const modality of ['pickup', 'SHIP', '', 3]) {
      expect(KrogerHandoffSchema.safeParse({ items: [{ upc: '1', quantity: 1 }], modality }).success).toBe(false);
    }
  });

  it('reads old pending cookies as PICKUP and drops lines with a bad modality', async () => {
    const { parsePendingCart } = await import('@/lib/grocery/kroger-cart');
    expect(parsePendingCart(JSON.stringify([{ upc: '1', quantity: 1 }]))).toEqual([
      { upc: '1', quantity: 1, modality: 'PICKUP' },
    ]);
    expect(
      parsePendingCart(
        JSON.stringify([
          { upc: '1', quantity: 1, modality: 'DELIVERY' },
          { upc: '2', quantity: 1, modality: 'BOAT' },
        ]),
      ),
    ).toEqual([{ upc: '1', quantity: 1, modality: 'DELIVERY' }]);
    expect(parsePendingCart(JSON.stringify([{ upc: '2', quantity: 1, modality: 'BOAT' }]))).toBeNull();
    expect(parsePendingCart('not json')).toBeNull();
    expect(parsePendingCart(undefined)).toBeNull();
  });

  it('sends modality on every line of the /cart/add payload', async () => {
    const { addToKrogerCart } = await import('@/lib/grocery/kroger-api');
    const calls: { url: string; body: unknown }[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    try {
      const ok = await addToKrogerCart('token', [
        { upc: '1', quantity: 2, modality: 'DELIVERY' },
        { upc: '2', quantity: 1, modality: 'DELIVERY' },
      ]);
      expect(ok).toBe(true);
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toMatch(/\/cart\/add$/);
    expect(calls[0].body).toEqual({
      items: [
        { upc: '1', quantity: 2, modality: 'DELIVERY' },
        { upc: '2', quantity: 1, modality: 'DELIVERY' },
      ],
    });
  });
});
