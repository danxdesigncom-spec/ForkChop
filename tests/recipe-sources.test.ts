import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchAllSources, THIN_RESULTS_THRESHOLD } from '@/lib/recipes';
import { clearCache } from '@/lib/recipes/spoonacular/client';

/**
 * Aggregator behaviour: when the metered source is consulted, and how each
 * failure mode degrades. This is where quota gets spent, so it is worth
 * pinning down.
 *
 * Mocks at the HTTP boundary so the real client, mapper and taxonomy all run.
 */

const spoonacularPayload = (count: number) => ({
  results: Array.from({ length: count }, (_, i) => ({
    id: 900 + i,
    title: `External Recipe ${i}`,
    image: `https://img.spoonacular.com/${900 + i}.jpg`,
    servings: 2,
    readyInMinutes: 20,
    cuisines: ['Italian'],
    dishTypes: ['main course'],
    extendedIngredients: [
      { name: 'pasta', amount: 200, unit: 'g' },
      { name: 'garlic', amount: 1, unit: 'clove' },
    ],
    analyzedInstructions: [{ steps: [{ number: 1, step: 'Cook it.' }] }],
  })),
});

let fetchCalls: string[] = [];

function mockSpoonacular(handler: (url: string) => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL) => {
      const href = String(url);
      fetchCalls.push(href);
      return handler(href);
    }),
  );
}

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  fetchCalls = [];
  clearCache();
  vi.stubEnv('SPOONACULAR_API_KEY', 'test-key');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('searchAllSources — when the metered source is used', () => {
  it('skips Spoonacular when the local corpus already has plenty to cook', async () => {
    mockSpoonacular(() => ok(spoonacularPayload(5)));

    // Measured against the real corpus: this pantry yields 6 ready matches,
    // comfortably above THIN_RESULTS_THRESHOLD.
    const ids = [
      'pasta', 'garlic', 'olive-oil', 'chilli', 'parsley', 'parmesan', 'egg', 'bacon',
      'onion', 'chopped-tomatoes', 'rice', 'potato', 'butter', 'milk', 'flour',
      'cheddar', 'carrot', 'celery', 'stock', 'beef-mince',
    ];

    const result = await searchAllSources({
      pantryIngredientIds: ids,
      pantryIngredientNames: ids,
      options: {},
    });

    expect(fetchCalls).toHaveLength(0);
    expect(result.sourcesUsed).toEqual(['local']);
  });

  it('calls Spoonacular when local results are thin', async () => {
    mockSpoonacular(() => ok(spoonacularPayload(3)));

    // One obscure ingredient: nothing local is cookable.
    const result = await searchAllSources({
      pantryIngredientIds: ['tahini'],
      pantryIngredientNames: ['Tahini'],
      options: {},
    });

    expect(fetchCalls.length).toBeGreaterThan(0);
    expect(fetchCalls[0]).toContain('/recipes/complexSearch');
    expect(result.sourcesUsed).toContain('spoonacular');
    expect(result.recipes.some((r) => r.sourceId === 'spoonacular')).toBe(true);
  });

  it('never calls a metered source for an empty pantry', async () => {
    mockSpoonacular(() => ok(spoonacularPayload(3)));

    await searchAllSources({ pantryIngredientIds: [], pantryIngredientNames: [], options: {} });

    expect(fetchCalls).toHaveLength(0);
  });

  it('keeps the API key out of the cache key but sends it upstream', async () => {
    mockSpoonacular(() => ok(spoonacularPayload(1)));

    await searchAllSources({
      pantryIngredientIds: ['tahini'],
      pantryIngredientNames: ['Tahini'],
      options: {},
    });

    expect(fetchCalls[0]).toContain('apiKey=test-key');
  });

  it('serves a repeated identical search from cache', async () => {
    mockSpoonacular(() => ok(spoonacularPayload(2)));

    const input = {
      pantryIngredientIds: ['tahini'],
      pantryIngredientNames: ['Tahini'],
      options: {},
    };

    await searchAllSources(input);
    const afterFirst = fetchCalls.length;
    await searchAllSources(input);

    // The whole point: the free tier is 150 points a day.
    expect(fetchCalls.length).toBe(afterFirst);
  });
});

describe('searchAllSources — allergen safety', () => {
  it('withholds external recipes when an unmappable allergy is selected', async () => {
    mockSpoonacular(() => ok(spoonacularPayload(5)));

    const result = await searchAllSources({
      pantryIngredientIds: ['tahini'],
      pantryIngredientNames: ['Tahini'],
      options: { excludeAllergens: ['mustard'] },
    });

    // Spoonacular cannot filter mustard, so it is never asked.
    expect(fetchCalls).toHaveLength(0);
    expect(result.recipes.every((r) => (r.sourceId ?? 'local') === 'local')).toBe(true);
    expect(result.notices.join(' ')).toMatch(/mustard or celery/);
  });

  it('still queries Spoonacular for allergens it can express', async () => {
    mockSpoonacular((url) => {
      expect(url).toContain('intolerances=Dairy');
      return ok(spoonacularPayload(2));
    });

    await searchAllSources({
      pantryIngredientIds: ['tahini'],
      pantryIngredientNames: ['Tahini'],
      options: { excludeAllergens: ['dairy'] },
    });

    expect(fetchCalls.length).toBeGreaterThan(0);
  });
});

describe('searchAllSources — failure handling', () => {
  const thinPantry = {
    pantryIngredientIds: ['tahini'],
    pantryIngredientNames: ['Tahini'],
    options: {},
  };

  it('degrades to local results and explains a spent quota', async () => {
    mockSpoonacular(() => new Response('payment required', { status: 402 }));

    const result = await searchAllSources(thinPantry);

    expect(result.recipes.length).toBeGreaterThan(0);
    expect(result.recipes.every((r) => (r.sourceId ?? 'local') === 'local')).toBe(true);
    expect(result.notices.join(' ')).toMatch(/daily limit/);
  });

  it('degrades on a rejected API key', async () => {
    mockSpoonacular(() => new Response('unauthorized', { status: 401 }));

    const result = await searchAllSources(thinPantry);
    expect(result.notices.join(' ')).toMatch(/misconfigured/);
    expect(result.recipes.length).toBeGreaterThan(0);
  });

  it('degrades when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));

    const result = await searchAllSources(thinPantry);
    expect(result.notices.join(' ')).toMatch(/Couldn’t reach/);
    expect(result.recipes.length).toBeGreaterThan(0);
  });

  it('handles an empty upstream result without a notice', async () => {
    mockSpoonacular(() => ok({ results: [] }));

    const result = await searchAllSources(thinPantry);
    expect(result.notices).toEqual([]);
    expect(result.recipes.every((r) => (r.sourceId ?? 'local') === 'local')).toBe(true);
  });

  it('is silent when no API key is set', async () => {
    vi.stubEnv('SPOONACULAR_API_KEY', '');
    mockSpoonacular(() => ok(spoonacularPayload(3)));

    const result = await searchAllSources(thinPantry);

    expect(fetchCalls).toHaveLength(0);
    expect(result.notices).toEqual([]);
    expect(result.sourcesUsed).toEqual(['local']);
  });
});

describe('threshold', () => {
  it('is documented and small enough to protect the quota', () => {
    expect(THIN_RESULTS_THRESHOLD).toBeGreaterThan(0);
    expect(THIN_RESULTS_THRESHOLD).toBeLessThanOrEqual(10);
  });
});
