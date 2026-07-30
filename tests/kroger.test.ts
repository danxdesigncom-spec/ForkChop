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
