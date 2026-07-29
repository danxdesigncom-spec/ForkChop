/**
 * Keeps "My Recipes" in step between the browser and the account.
 *
 * Two modes, one UI:
 *   signed out - localStorage is the source of truth (unchanged behaviour)
 *   signed in  - the account is the source of truth
 *
 * On first sign-in, anything saved anonymously is merged into the account
 * rather than discarded. Someone who hearts ten recipes and then signs up
 * should not watch them vanish — that reads as data loss, not as a feature.
 *
 * The local store is still written in both modes, so the list renders instantly
 * on next load without waiting for a round-trip.
 */

import type { Recipe } from './types';

export interface SyncResult {
  slugs: string[];
  error: string | null;
}

async function readSlugs(response: Response): Promise<string[]> {
  const data = (await response.json()) as { slugs?: unknown };
  return Array.isArray(data.slugs) ? data.slugs.filter((s): s is string => typeof s === 'string') : [];
}

/**
 * Called once when a signed-in session appears. Uploads local saves, then
 * returns the account's full list.
 */
export async function mergeLocalIntoAccount(localSlugs: string[]): Promise<SyncResult> {
  try {
    // Nothing local to contribute — just fetch what the account already has.
    if (localSlugs.length === 0) {
      const response = await fetch('/api/saved-recipes');
      if (!response.ok) throw new Error(String(response.status));
      return { slugs: await readSlugs(response), error: null };
    }

    const response = await fetch('/api/saved-recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merge: localSlugs }),
    });
    if (!response.ok) throw new Error(String(response.status));
    return { slugs: await readSlugs(response), error: null };
  } catch {
    // Keep whatever is local rather than blanking the list on a network blip.
    return { slugs: localSlugs, error: 'Could not sync your saved recipes. Showing this device’s list.' };
  }
}

export async function addSavedRecipe(slug: string, recipe?: Recipe): Promise<SyncResult> {
  try {
    // External recipes carry a snapshot so My Recipes can render them later
    // without re-fetching — no quota cost, and it survives the provider being
    // down. Local recipes are read from the bundled corpus instead.
    const sourceId = recipe?.sourceId ?? 'local';
    const body =
      sourceId === 'local' ? { slug } : { slug, sourceId, snapshot: recipe };

    const response = await fetch('/api/saved-recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(String(response.status));
    return { slugs: await readSlugs(response), error: null };
  } catch {
    return { slugs: [], error: 'Could not save that to your account.' };
  }
}

export async function removeSavedRecipe(slug: string): Promise<SyncResult> {
  try {
    const response = await fetch(`/api/saved-recipes?slug=${encodeURIComponent(slug)}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error(String(response.status));
    return { slugs: [], error: null };
  } catch {
    return { slugs: [], error: 'Could not remove that from your account.' };
  }
}
