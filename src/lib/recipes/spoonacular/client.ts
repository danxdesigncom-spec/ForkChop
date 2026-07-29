import type { SpoonacularRecipe } from './map';

/**
 * Thin HTTP layer over Spoonacular.
 *
 * SERVER ONLY. `SPOONACULAR_API_KEY` has no NEXT_PUBLIC_ prefix, so Next.js
 * will not inline it into the browser bundle, and nothing here is imported by
 * a client component. The browser reaches Spoonacular only through
 * /api/recommendations, which is the proxy.
 */

const BASE_URL = 'https://api.spoonacular.com';
const TIMEOUT_MS = 8000;

export class SpoonacularError extends Error {
  constructor(
    message: string,
    readonly kind: 'quota' | 'auth' | 'network' | 'upstream',
  ) {
    super(message);
    this.name = 'SpoonacularError';
  }
}

export function getApiKey(): string | null {
  const key = process.env.SPOONACULAR_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

export function isConfigured(): boolean {
  return getApiKey() !== null;
}

/**
 * In-memory response cache.
 *
 * Deliberately simple: the free tier is 150 points a day, and repeating the
 * same search while developing would burn it in minutes. Per-instance and
 * lost on cold start, which is fine — recipe search results are public,
 * read-only and cheap to rebuild, so a cache miss costs one request rather
 * than correctness. Anything shared across instances would need Redis, which
 * is not worth it at this scale.
 */
interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;
const cache = new Map<string, CacheEntry>();

function cacheGet<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit.value as T;
}

function cacheSet(key: string, value: unknown): void {
  // Crude bound, but it stops a long-lived instance growing without limit.
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Exposed for tests and for the dev-only cache stats in the API response. */
export function cacheStats() {
  return { entries: cache.size, ttlMs: CACHE_TTL_MS };
}

export function clearCache(): void {
  cache.clear();
}

async function request<T>(path: string, params: Record<string, string>): Promise<T> {
  const apiKey = getApiKey();
  if (!apiKey) throw new SpoonacularError('Spoonacular is not configured.', 'auth');

  const search = new URLSearchParams(params);
  // Cache key excludes the key itself so it never lands in a log line.
  const cacheKey = `${path}?${search.toString()}`;

  const cached = cacheGet<T>(cacheKey);
  if (cached) return cached;

  search.set('apiKey', apiKey);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}?${search.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Next's own cache would key on the URL including the API key.
      cache: 'no-store',
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    throw new SpoonacularError(
      timedOut ? 'Spoonacular took too long to respond.' : 'Could not reach Spoonacular.',
      'network',
    );
  }

  // 402 is how Spoonacular reports a spent daily quota; 429 is rate limiting.
  if (response.status === 402 || response.status === 429) {
    throw new SpoonacularError('Spoonacular daily quota reached.', 'quota');
  }
  if (response.status === 401 || response.status === 403) {
    throw new SpoonacularError('Spoonacular rejected the API key.', 'auth');
  }
  if (!response.ok) {
    throw new SpoonacularError(`Spoonacular returned ${response.status}.`, 'upstream');
  }

  const data = (await response.json()) as T;
  cacheSet(cacheKey, data);
  return data;
}

export interface ComplexSearchParams {
  includeIngredients: string[];
  intolerances: string[];
  diets: string[];
  cuisines: string[];
  mealTypes: string[];
  maxReadyTime?: number;
  number: number;
}

interface ComplexSearchResponse {
  results?: SpoonacularRecipe[];
  totalResults?: number;
}

/**
 * One call for everything.
 *
 * `complexSearch` with `includeIngredients` + `fillIngredients` *is* the
 * find-by-ingredients capability, but unlike the dedicated findByIngredients
 * endpoint it also accepts diet, intolerances, cuisine, type and maxReadyTime.
 * Adding `addRecipeInformation` returns full details in the same response.
 *
 * The alternative — findByIngredients then one detail call per recipe — costs
 * roughly 11 points for 10 recipes against about 1.5 this way, which matters a
 * great deal on a 150-point daily allowance.
 */
export async function complexSearch(params: ComplexSearchParams): Promise<SpoonacularRecipe[]> {
  const query: Record<string, string> = {
    includeIngredients: params.includeIngredients.join(','),
    number: String(params.number),
    fillIngredients: 'true',
    addRecipeInformation: 'true',
    addRecipeInstructions: 'true',
    instructionsRequired: 'true',
    // Rank by how much of the pantry a recipe uses, matching the app's bias
    // toward cooking what you already have.
    sort: 'max-used-ingredients',
    ignorePantry: 'true',
  };

  if (params.intolerances.length) query.intolerances = params.intolerances.join(',');
  if (params.diets.length) query.diet = params.diets.join(',');
  if (params.cuisines.length) query.cuisine = params.cuisines.join(',');
  if (params.mealTypes.length) query.type = params.mealTypes.join(',');
  if (params.maxReadyTime) query.maxReadyTime = String(params.maxReadyTime);

  const data = await request<ComplexSearchResponse>('/recipes/complexSearch', query);
  return data.results ?? [];
}

/** Single recipe, used when re-displaying something saved earlier. */
export async function getRecipeInformation(id: number): Promise<SpoonacularRecipe | null> {
  try {
    return await request<SpoonacularRecipe>(`/recipes/${id}/information`, {
      includeNutrition: 'false',
    });
  } catch (error) {
    if (error instanceof SpoonacularError && error.kind === 'upstream') return null;
    throw error;
  }
}
