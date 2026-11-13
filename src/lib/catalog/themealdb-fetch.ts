/**
 * Enumerates TheMealDB's full catalogue through its official JSON API.
 *
 * Only API endpoints, never the website: TheMealDB's terms allow copying and
 * modifying what the API returns, and not scraping the site. Network access
 * comes in through `fetchImpl`, so the tests drive this with a fake and the
 * script with the real `fetch`.
 *
 * Strategy, per the brief:
 *   1. search.php?f={a..z,0..9}. A letter with no meals returns `meals: null`
 *      and is skipped.
 *   2. Cross-check against list.php?c=list → filter.php?c={category}, fetching
 *      any id the letter sweep missed with lookup.php?i={id}.
 *   3. latest.php, confirming its ids are present (looking up any that aren't).
 *
 * Polite by construction: one request at a time, a pause after each, and
 * exponential back-off (honouring Retry-After) on 429 and 5xx.
 */
import { redactKey, type TheMealDbMeal, type TheMealDbRaw } from './themealdb';

export const DEFAULT_THEMEALDB_BASE = 'https://www.themealdb.com/api/json/v2/';
export const USER_AGENT = 'ForkChop-catalog-import';

export interface FetchCatalogueOptions {
  /** API base without the key, ending in a slash: https://www.themealdb.com/api/json/v2/ */
  base: string;
  key: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Pause after every request. Default 250 ms. */
  delayMs?: number;
  /** Retries per request on 429/5xx/network errors. Default 5. */
  maxRetries?: number;
  log?: (message: string) => void;
  /** For deterministic tests. */
  now?: () => Date;
}

export interface FetchSummary {
  letters: Record<string, number>;
  bySearch: number;
  categories: number;
  byCategory: number;
  missingFromSearch: string[];
  latest: string[];
  missingFromLatest: string[];
  total: number;
  requests: number;
}

export type FetchedCatalogue = TheMealDbRaw & { summary: FetchSummary };

const LETTERS = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');

/** "v2" from ".../api/json/v2/"; null if the base doesn't say. */
export function apiVersionFromBase(base: string): string | null {
  return /\/api\/json\/(v\d+)\/?$/.exec(base)?.[1] ?? null;
}

export function normaliseBase(base: string): string {
  return base.endsWith('/') ? base : `${base}/`;
}

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function fetchCatalogue(options: FetchCatalogueOptions): Promise<FetchedCatalogue> {
  const base = normaliseBase(options.base);
  const key = options.key;
  if (!key || !key.trim()) throw new Error('THEMEALDB_API_KEY is not set.');
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const delayMs = options.delayMs ?? 250;
  const maxRetries = options.maxRetries ?? 5;
  const log = (message: string) => options.log?.(redactKey(message, key));
  let requests = 0;

  async function get(path: string): Promise<unknown> {
    const url = `${base}${encodeURIComponent(key.trim())}/${path}`;
    const shown = redactKey(url, key);
    for (let attempt = 0; ; attempt++) {
      requests += 1;
      let retryAfterMs: number | null = null;
      try {
        const res = await fetchImpl(url, {
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        });
        if (res.ok) {
          const text = await res.text();
          await sleep(delayMs);
          try {
            return text.trim() === '' ? null : JSON.parse(text);
          } catch {
            throw new HttpError(`Unparseable JSON from ${shown}`, res.status);
          }
        }
        if (res.status !== 429 && res.status < 500) {
          throw new HttpError(`HTTP ${res.status} from ${shown}`, res.status);
        }
        const header = res.headers.get('retry-after');
        if (header && /^\d+$/.test(header.trim())) retryAfterMs = Number(header) * 1000;
        if (attempt >= maxRetries) throw new HttpError(`HTTP ${res.status} from ${shown} after ${attempt + 1} attempts`, res.status);
        log(`HTTP ${res.status} from ${shown}; retrying`);
      } catch (error) {
        if (error instanceof HttpError) throw error;
        if (attempt >= maxRetries) {
          throw new Error(redactKey(`Network error on ${shown}: ${(error as Error).message}`, key));
        }
        log(`Network error on ${shown}; retrying`);
      }
      const backoff = Math.min(delayMs * 2 ** (attempt + 1), 8000);
      await sleep(Math.max(backoff, retryAfterMs ?? 0));
    }
  }

  const mealsFrom = (body: unknown): TheMealDbMeal[] => {
    const meals = (body as { meals?: unknown } | null)?.meals;
    // TheMealDB answers "nothing" with `meals: null`, and occasionally with a
    // string such as "Invalid ID". Neither is a meal.
    return Array.isArray(meals) ? (meals.filter((m) => m && typeof m === 'object' && m.idMeal) as TheMealDbMeal[]) : [];
  };

  const byId = new Map<string, TheMealDbMeal>();
  const letters: Record<string, number> = {};

  for (const letter of LETTERS) {
    const meals = mealsFrom(await get(`search.php?f=${letter}`));
    if (meals.length === 0) continue;
    letters[letter] = meals.length;
    for (const meal of meals) byId.set(String(meal.idMeal), meal);
  }
  const bySearch = byId.size;
  log(`search.php: ${bySearch} meals across ${Object.keys(letters).length} letters`);

  const categoryBody = (await get('list.php?c=list')) as { meals?: { strCategory?: string }[] | null } | null;
  const categories = (categoryBody?.meals ?? []).flatMap((c) => (c?.strCategory ? [c.strCategory] : []));
  const categoryIds = new Set<string>();
  for (const category of categories) {
    for (const meal of mealsFrom(await get(`filter.php?c=${encodeURIComponent(category)}`))) {
      categoryIds.add(String(meal.idMeal));
    }
  }

  const lookup = async (id: string) => {
    const [meal] = mealsFrom(await get(`lookup.php?i=${encodeURIComponent(id)}`));
    if (meal) byId.set(String(meal.idMeal), meal);
    else log(`lookup.php?i=${id} returned nothing`);
  };

  const missingFromSearch = [...categoryIds].filter((id) => !byId.has(id)).sort((a, b) => Number(a) - Number(b));
  for (const id of missingFromSearch) await lookup(id);
  log(`filter.php: ${categoryIds.size} ids over ${categories.length} categories; ${missingFromSearch.length} missing from search`);

  const latest = mealsFrom(await get('latest.php')).map((m) => String(m.idMeal));
  const missingFromLatest = latest.filter((id) => !byId.has(id));
  for (const id of missingFromLatest) await lookup(id);

  const meals = [...byId.values()].sort((a, b) => Number(a.idMeal) - Number(b.idMeal));

  return {
    source: 'themealdb',
    api_version: apiVersionFromBase(base) ?? 'unknown',
    fetched_at: (options.now ?? (() => new Date()))().toISOString(),
    summary: {
      letters,
      bySearch,
      categories: categories.length,
      byCategory: categoryIds.size,
      missingFromSearch,
      latest,
      missingFromLatest,
      total: meals.length,
      requests,
    },
    meals,
  };
}
