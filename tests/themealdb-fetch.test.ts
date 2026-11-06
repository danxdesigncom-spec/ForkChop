import { describe, expect, it } from 'vitest';
import { apiVersionFromBase, fetchCatalogue, USER_AGENT } from '@/lib/catalog/themealdb-fetch';

/**
 * The fetch flow against a fake TheMealDB. No network: `fetchImpl` is a stub
 * that answers from a tiny in-memory catalogue.
 */

const KEY = 'sekr1t-key';
const BASE = 'https://www.themealdb.com/api/json/v2/';

const meal = (id: string, name: string) => ({ idMeal: id, strMeal: name, strCategory: 'Beef' });
const CATALOGUE: Record<string, ReturnType<typeof meal>[] | null> = {
  a: [meal('3', 'Apple Pie'), meal('1', 'Arrabiata')],
  b: [meal('2', 'Beef Stew')],
};

interface Call {
  url: string;
  headers: Record<string, string>;
}

function fakeApi(overrides: Record<string, () => Response> = {}) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    const path = url.slice(`${BASE}${KEY}/`.length);
    if (overrides[path]) return overrides[path]();
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

    const search = /^search\.php\?f=(.)$/.exec(path);
    if (search) return json({ meals: CATALOGUE[search[1]] ?? null });
    if (path === 'list.php?c=list') return json({ meals: [{ strCategory: 'Beef' }, { strCategory: 'Dessert' }] });
    if (path === 'filter.php?c=Beef') return json({ meals: [{ idMeal: '1' }, { idMeal: '2' }, { idMeal: '4' }] });
    if (path === 'filter.php?c=Dessert') return json({ meals: [{ idMeal: '3' }] });
    if (path === 'lookup.php?i=4') return json({ meals: [meal('4', 'Zz Hidden')] });
    if (path === 'lookup.php?i=5') return json({ meals: [meal('5', 'Brand New')] });
    if (path === 'latest.php') return json({ meals: [meal('5', 'Brand New'), meal('3', 'Apple Pie')] });
    return json({ meals: null });
  }) as typeof fetch;
  return { impl, calls };
}

const run = (api: ReturnType<typeof fakeApi>, logs: string[] = []) =>
  fetchCatalogue({
    base: BASE,
    key: KEY,
    fetchImpl: api.impl,
    sleep: async () => {},
    log: (m) => logs.push(m),
    now: () => new Date('2026-11-06T12:00:00Z'),
  });

describe('fetchCatalogue', () => {
  it('sweeps letters, cross-checks categories and latest, and sorts by id', async () => {
    const api = fakeApi();
    const result = await run(api);
    expect(result.meals.map((m) => m.idMeal)).toEqual(['1', '2', '3', '4', '5']);
    expect(result.summary).toMatchObject({
      letters: { a: 2, b: 1 },
      bySearch: 3,
      categories: 2,
      byCategory: 4,
      missingFromSearch: ['4'],
      latest: ['5', '3'],
      missingFromLatest: ['5'],
      total: 5,
    });
    expect(result).toMatchObject({ source: 'themealdb', api_version: 'v2', fetched_at: '2026-11-06T12:00:00.000Z' });
  });

  it('only calls official API endpoints, sequentially, with the agreed User-Agent', async () => {
    const api = fakeApi();
    await run(api);
    for (const call of api.calls) {
      expect(call.url.startsWith(`${BASE}${KEY}/`)).toBe(true);
      expect(call.url).toMatch(/\/(search|list|filter|lookup|latest)\.php/);
      expect(call.headers['User-Agent']).toBe(USER_AGENT);
    }
    // 36 letters + list + 2 categories + 1 lookup + latest + 1 lookup.
    expect(api.calls).toHaveLength(42);
  });

  it('pauses after every request', async () => {
    const sleeps: number[] = [];
    await fetchCatalogue({ base: BASE, key: KEY, fetchImpl: fakeApi().impl, sleep: async (ms) => void sleeps.push(ms) });
    expect(sleeps.length).toBe(42);
    expect(sleeps.every((ms) => ms === 250)).toBe(true);
  });

  it('backs off and retries on 429 (honouring Retry-After) and 5xx', async () => {
    let n = 0;
    const api = fakeApi({
      'search.php?f=a': () => {
        n += 1;
        if (n === 1) return new Response('', { status: 429, headers: { 'Retry-After': '3' } });
        if (n === 2) return new Response('', { status: 503 });
        return new Response(JSON.stringify({ meals: CATALOGUE.a }), { status: 200 });
      },
    });
    const sleeps: number[] = [];
    const result = await fetchCatalogue({ base: BASE, key: KEY, fetchImpl: api.impl, sleep: async (ms) => void sleeps.push(ms) });
    expect(n).toBe(3);
    expect(sleeps.slice(0, 2)).toEqual([3000, 1000]); // Retry-After, then exponential back-off
    expect(result.meals).toHaveLength(5);
  });

  it('gives up after maxRetries without leaking the key', async () => {
    const api = fakeApi({ 'search.php?f=a': () => new Response('', { status: 500 }) });
    const error = await fetchCatalogue({ base: BASE, key: KEY, fetchImpl: api.impl, sleep: async () => {}, maxRetries: 2 }).catch(
      (e: Error) => e,
    );
    expect(String(error)).toContain('/api/json/v2/***/search.php?f=a');
    expect(String(error)).not.toContain(KEY);
  });

  it('fails fast on other 4xx, again without the key', async () => {
    const api = fakeApi({ 'list.php?c=list': () => new Response('', { status: 403 }) });
    const error = await run(api).catch((e: Error) => e);
    expect(String(error)).toMatch(/HTTP 403/);
    expect(String(error)).not.toContain(KEY);
  });

  it('never writes the key into the result or the log', async () => {
    const logs: string[] = [];
    let failed = false;
    const flaky = () => {
      if (failed) return new Response(JSON.stringify({ meals: null }), { status: 200 });
      failed = true;
      return new Response('', { status: 502 });
    };
    const result = await run(fakeApi({ 'search.php?f=c': flaky }), logs);
    expect(JSON.stringify(result)).not.toContain(KEY);
    expect(logs.join('\n')).not.toContain(KEY);
    expect(logs.some((l) => l.includes('/v2/***/'))).toBe(true);
  });

  it('refuses to run without a key (no silent fallback to the test key)', async () => {
    await expect(fetchCatalogue({ base: BASE, key: '', fetchImpl: fakeApi().impl })).rejects.toThrow(/THEMEALDB_API_KEY/);
  });

  it('treats a string "meals" value as no meals', async () => {
    const api = fakeApi({ 'lookup.php?i=4': () => new Response(JSON.stringify({ meals: 'Invalid ID' }), { status: 200 }) });
    const result = await run(api);
    expect(result.meals.map((m) => m.idMeal)).toEqual(['1', '2', '3', '5']);
  });
});

describe('apiVersionFromBase', () => {
  it('reads the version from the base URL', () => {
    expect(apiVersionFromBase('https://www.themealdb.com/api/json/v2/')).toBe('v2');
    expect(apiVersionFromBase('https://www.themealdb.com/api/json/v1')).toBe('v1');
    expect(apiVersionFromBase('https://example.com/')).toBeNull();
  });
});
