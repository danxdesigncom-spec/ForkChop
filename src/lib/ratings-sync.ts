/**
 * Ratings sync layer, in the same shape as saved-recipes.ts and pantry-sync.ts.
 *
 * Reads are best-effort — a network blip returns an empty map rather than
 * blowing up every card. Writes surface a boolean so the UI can show a
 * per-card save state.
 */

export interface RatingSummary {
  avg: number;
  count: number;
  mine: number | null;
}

export type RatingsBySlug = Record<string, RatingSummary>;

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchRatings(slugs: string[]): Promise<RatingsBySlug> {
  if (slugs.length === 0) return {};
  try {
    const response = await fetch(
      `/api/ratings?slugs=${encodeURIComponent(slugs.join(','))}`,
    );
    if (!response.ok) return {};
    const data = await readJson<{ ratings?: RatingsBySlug }>(response);
    return data?.ratings ?? {};
  } catch {
    return {};
  }
}

export async function saveRating(slug: string, stars: number): Promise<RatingSummary | null> {
  try {
    const response = await fetch('/api/ratings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, stars }),
    });
    if (!response.ok) return null;
    const data = await readJson<RatingSummary & { slug: string }>(response);
    if (!data) return null;
    return { avg: data.avg, count: data.count, mine: data.mine };
  } catch {
    return null;
  }
}
