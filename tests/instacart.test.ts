import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInstacartProvider } from '@/lib/grocery/instacart-provider';
import { ProviderNotConfiguredError } from '@/lib/grocery';

/**
 * Instacart's real Products Link API is called with an API key we hold, not
 * per-user OAuth. These tests pin the request shape and the failure modes so a
 * later refactor doesn't quietly break the deep link.
 */

const categories = new Map<string, string>([
  ['tahini', 'condiment'],
  ['lemon', 'produce'],
]);

const items = [
  { ingredientId: 'tahini', name: 'Tahini', quantity: 1, unit: null, neededFor: ['Hummus'] },
  { ingredientId: 'lemon', name: 'Lemon', quantity: 2, unit: 'each', neededFor: ['Hummus'] },
];

let calls: { url: string; init: RequestInit }[] = [];

const mockFetch = (handler: (url: string, init: RequestInit) => Response) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return handler(String(url), init ?? {});
    }),
  );
};

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Instacart provider — configuration', () => {
  it('is unconfigured when the key is missing', () => {
    vi.stubEnv('INSTACART_API_KEY', '');
    expect(createInstacartProvider(categories).configured).toBe(false);
  });

  it('is configured when the key is present', () => {
    vi.stubEnv('INSTACART_API_KEY', 'test-key');
    expect(createInstacartProvider(categories).configured).toBe(true);
  });

  it('throws ProviderNotConfiguredError on createCart without a key', async () => {
    vi.stubEnv('INSTACART_API_KEY', '');
    await expect(createInstacartProvider(categories).createCart(items)).rejects.toBeInstanceOf(
      ProviderNotConfiguredError,
    );
  });
});

describe('Instacart provider — request shape', () => {
  beforeEach(() => vi.stubEnv('INSTACART_API_KEY', 'test-key'));

  it('POSTs to the production host by default with a Bearer token', async () => {
    mockFetch(() => ok({ products_link_url: 'https://instacart.com/store/list/abc' }));

    await createInstacartProvider(categories).createCart(items);

    expect(calls[0].url).toBe('https://connect.instacart.com/idp/v1/products/products_link');
    expect(calls[0].init.method).toBe('POST');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-key');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('routes to the dev host when INSTACART_ENV=dev', async () => {
    vi.stubEnv('INSTACART_ENV', 'dev');
    mockFetch(() => ok({ products_link_url: 'https://dev.example/list' }));

    await createInstacartProvider(categories).createCart(items);

    expect(calls[0].url).toBe('https://connect.dev.instacart.tools/idp/v1/products/products_link');
  });

  it('sends the item list as line_items with the fields Instacart documents', async () => {
    mockFetch(() => ok({ products_link_url: 'https://x/y' }));

    await createInstacartProvider(categories).createCart(items);

    const body = JSON.parse(String(calls[0].init.body));
    expect(body.link_type).toBe('shopping_list');
    expect(body.line_items).toEqual([
      { name: 'Tahini', quantity: 1, unit: 'each' }, // null unit defaults to 'each'
      { name: 'Lemon', quantity: 2, unit: 'each' },
    ]);
    expect(body.expires_in).toBeGreaterThan(0);
    expect(body.title).toBeTruthy();
  });

  it('titles the list from the recipes it was built for', async () => {
    mockFetch(() => ok({ products_link_url: 'https://x/y' }));

    await createInstacartProvider(categories).createCart([
      { ingredientId: 'a', name: 'A', quantity: 1, unit: null, neededFor: ['Shakshuka'] },
      { ingredientId: 'b', name: 'B', quantity: 1, unit: null, neededFor: ['Shakshuka'] },
    ]);

    const body = JSON.parse(String(calls[0].init.body));
    expect(body.title).toBe('For Shakshuka');
  });

  it('falls back to a default title when no recipes are named', async () => {
    mockFetch(() => ok({ products_link_url: 'https://x/y' }));

    await createInstacartProvider(categories).createCart([
      { ingredientId: 'a', name: 'A', quantity: 1, unit: null, neededFor: [] },
    ]);

    const body = JSON.parse(String(calls[0].init.body));
    // title is required by the docs — never empty.
    expect(body.title.length).toBeGreaterThan(0);
  });
});

describe('Instacart provider — response handling', () => {
  beforeEach(() => vi.stubEnv('INSTACART_API_KEY', 'test-key'));

  it('returns a cart carrying the products_link_url as checkoutUrl', async () => {
    mockFetch(() => ok({ products_link_url: 'https://instacart.com/store/list/abc123' }));

    const cart = await createInstacartProvider(categories).createCart(items);

    expect(cart.providerId).toBe('instacart');
    expect(cart.checkoutUrl).toBe('https://instacart.com/store/list/abc123');
    expect(cart.items).toHaveLength(2);
    // Instacart doesn't itemise prices in this response — the picker UI
    // handles zero, but we shouldn't invent numbers.
    expect(cart.subtotalCents).toBe(0);
    expect(cart.totalCents).toBe(0);
  });

  it('treats 401/403 as unconfigured, not a server error', async () => {
    mockFetch(() => new Response('nope', { status: 401 }));

    await expect(createInstacartProvider(categories).createCart(items)).rejects.toBeInstanceOf(
      ProviderNotConfiguredError,
    );
  });

  it('reports a generic upstream failure on other bad status codes', async () => {
    mockFetch(() => new Response('boom', { status: 500 }));

    await expect(createInstacartProvider(categories).createCart(items)).rejects.toThrow(/500/);
  });

  it('reports a missing url as an upstream error', async () => {
    // If Instacart accepts the request but returns an empty body somehow, we
    // shouldn't hand the user an empty link.
    mockFetch(() => ok({}));

    await expect(createInstacartProvider(categories).createCart(items)).rejects.toThrow(/no link/);
  });
});
