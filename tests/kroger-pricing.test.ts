import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createKrogerProvider } from '@/lib/grocery/kroger-provider';
import { clearKrogerCaches } from '@/lib/grocery/kroger-api';
import type { GroceryLineItem } from '@/lib/grocery/types';

/**
 * Kroger pricing is an *estimate* — a fuzzy product match, at one store,
 * before tax. These tests pin the two properties that make that honest:
 *
 *   1. A line we could not price is never given a number, and never counts
 *      toward the total as if it were free.
 *   2. Any cart carrying prices also carries the disclaimer.
 *
 * They also pin the degradation path, because the whole design rests on
 * Kroger staying usable with no credentials at all.
 */

const CATEGORIES = new Map([
  ['milk', 'dairy'],
  ['eggs', 'dairy'],
  ['bread', 'bakery'],
]);

function line(ingredientId: string, name: string): GroceryLineItem {
  return { ingredientId, name, quantity: 1, unit: null, neededFor: [] };
}

/** A Kroger /products response for one matched item. */
function productResponse(upc: string, regular: number, promo = 0) {
  return {
    ok: true,
    json: async () => ({
      data: [
        {
          upc,
          description: `Kroger ${upc}`,
          brand: 'Kroger',
          items: [{ size: '1 gal', price: { regular, promo } }],
        },
      ],
    }),
  };
}

const TOKEN_RESPONSE = {
  ok: true,
  json: async () => ({ access_token: 'test-token', expires_in: 1800 }),
};

beforeEach(() => {
  clearKrogerCaches();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  clearKrogerCaches();
});

describe('Kroger provider without credentials', () => {
  it('still builds a deep-linking cart, with no prices and no disclaimer', async () => {
    const provider = createKrogerProvider(CATEGORIES);
    const cart = await provider.createCart([line('milk', 'Milk'), line('eggs', 'Eggs')]);

    expect(cart.items).toHaveLength(2);
    expect(cart.subtotalCents).toBe(0);
    expect(cart.pricedItemCount).toBe(0);
    // No money on screen means no estimate warning to give.
    expect(cart.priceDisclaimer).toBeUndefined();
    // The deep link and clipboard fallback must survive.
    expect(cart.checkoutUrl).toContain('kroger.com');
    expect(cart.clipboardText).toBe('1 Milk\n1 Eggs');
    // Nothing to push to a cart without real UPCs.
    expect(cart.cartHandoffUrl).toBeUndefined();
  });

  it('reports every line as unpriced rather than zero-priced', async () => {
    const provider = createKrogerProvider(CATEGORIES);
    const cart = await provider.createCart([line('milk', 'Milk')]);
    expect(cart.items[0].offer.priced).toBe(false);
  });
});

describe('Kroger provider with pricing configured', () => {
  beforeEach(() => {
    vi.stubEnv('KROGER_CLIENT_ID', 'id');
    vi.stubEnv('KROGER_CLIENT_SECRET', 'secret');
    vi.stubEnv('KROGER_LOCATION_ID', '01400376');
  });

  it('prices matched lines and attaches the estimate disclaimer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/token')) return TOKEN_RESPONSE;
        return productResponse('0001111041700', 3.49);
      }),
    );

    const provider = createKrogerProvider(CATEGORIES);
    const cart = await provider.createCart([line('milk', 'Milk')]);

    expect(cart.items[0].offer.priced).toBe(true);
    expect(cart.items[0].offer.priceCents).toBe(349);
    expect(cart.subtotalCents).toBe(349);
    expect(cart.pricedItemCount).toBe(1);
    expect(cart.priceDisclaimer).toMatch(/estimated/i);
    // The disclaimer has to name the two things that move the number.
    expect(cart.priceDisclaimer).toMatch(/tax/i);
    expect(cart.priceDisclaimer).toMatch(/checkout/i);
  });

  it('prefers a live promo price over the regular price', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/token')) return TOKEN_RESPONSE;
        return productResponse('0001111041700', 4.99, 2.99);
      }),
    );

    const provider = createKrogerProvider(CATEGORIES);
    const cart = await provider.createCart([line('milk', 'Milk')]);

    expect(cart.items[0].offer.priceCents).toBe(299);
    expect(cart.items[0].offer.onPromotion).toBe(true);
  });

  it('treats promo: 0 as "no promotion", not as free', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/token')) return TOKEN_RESPONSE;
        return productResponse('0001111041700', 4.99, 0);
      }),
    );

    const provider = createKrogerProvider(CATEGORIES);
    const cart = await provider.createCart([line('milk', 'Milk')]);

    expect(cart.items[0].offer.priceCents).toBe(499);
    expect(cart.items[0].offer.onPromotion).toBe(false);
  });

  it('leaves an unmatched line unpriced and out of the subtotal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const href = String(url);
        if (href.includes('/token')) return TOKEN_RESPONSE;
        // Only milk matches; the other search comes back empty.
        if (href.includes('Milk')) return productResponse('0001111041700', 3.49);
        return { ok: true, json: async () => ({ data: [] }) };
      }),
    );

    const provider = createKrogerProvider(CATEGORIES);
    const cart = await provider.createCart([line('milk', 'Milk'), line('bread', 'Bread')]);

    expect(cart.pricedItemCount).toBe(1);
    // The unpriced loaf must not be counted as costing nothing.
    expect(cart.subtotalCents).toBe(349);
    const bread = cart.items.find((i) => i.offer.ingredientId === 'bread');
    expect(bread?.offer.priced).toBe(false);
    expect(bread?.lineTotalCents).toBe(0);
  });

  it('degrades to an unpriced cart when the API fails outright', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    const provider = createKrogerProvider(CATEGORIES);
    const cart = await provider.createCart([line('milk', 'Milk')]);

    // Still a usable cart — the deep link is the floor, not an error page.
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].offer.priced).toBe(false);
    expect(cart.checkoutUrl).toContain('kroger.com');
  });

  it('offers the cart handoff only once a redirect URI is configured', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/token')) return TOKEN_RESPONSE;
        return productResponse('0001111041700', 3.49);
      }),
    );

    const withoutRedirect = await createKrogerProvider(CATEGORIES).createCart([
      line('milk', 'Milk'),
    ]);
    expect(withoutRedirect.cartHandoffUrl).toBeUndefined();

    vi.stubEnv('KROGER_REDIRECT_URI', 'https://example.com/api/kroger/callback');
    clearKrogerCaches();
    const withRedirect = await createKrogerProvider(CATEGORIES).createCart([line('milk', 'Milk')]);
    expect(withRedirect.cartHandoffUrl).toBe('/api/kroger/authorize');
  });

  it('brands the cart with the banner of the store being priced', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const href = String(url);
        if (href.includes('/token')) return TOKEN_RESPONSE;
        if (href.includes('/locations/')) {
          return {
            ok: true,
            json: async () => ({
              data: { locationId: '70400385', name: 'Food 4 Less - Highland', chain: 'FOOD4LESS' },
            }),
          };
        }
        return productResponse('0001111041700', 3.49);
      }),
    );

    const cart = await createKrogerProvider(CATEGORIES, '70400385').createCart([line('milk', 'Milk')]);

    // A Food 4 Less shopper must never see a basket labelled "Kroger", nor a
    // link to a site their store does not exist on.
    expect(cart.providerName).toBe('Food 4 Less');
    expect(cart.checkoutUrl).toContain('food4less.com');
    expect(cart.checkoutUrl).not.toContain('kroger.com');
    expect(cart.priceDisclaimer).toContain('Food 4 Less');
  });

  it('prices against the shopper’s chosen store, not the env default', async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const href = String(url);
        if (href.includes('/token')) return TOKEN_RESPONSE;
        if (href.includes('/locations/')) {
          return { ok: true, json: async () => ({ data: { locationId: 'x', chain: 'RALPHS' } }) };
        }
        seen.push(new URL(href).searchParams.get('filter.locationId') ?? '');
        return productResponse('0001111041700', 3.49);
      }),
    );

    await createKrogerProvider(CATEGORIES, '70300753').createCart([line('milk', 'Milk')]);
    expect(seen).toEqual(['70300753']);
  });

  it('falls back to the Kroger banner when the store lookup fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const href = String(url);
        if (href.includes('/token')) return TOKEN_RESPONSE;
        if (href.includes('/locations/')) return { ok: false, json: async () => ({}) };
        return productResponse('0001111041700', 3.49);
      }),
    );

    const cart = await createKrogerProvider(CATEGORIES, '99999999').createCart([line('milk', 'Milk')]);
    expect(cart.providerName).toBe('Kroger');
    expect(cart.checkoutUrl).toContain('kroger.com');
  });

  it('uses the real UPC as the SKU so the handoff addresses the priced product', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/token')) return TOKEN_RESPONSE;
        return productResponse('0001111041700', 3.49);
      }),
    );

    const cart = await createKrogerProvider(CATEGORIES).createCart([line('milk', 'Milk')]);
    expect(cart.items[0].offer.sku).toBe('0001111041700');
  });
});
