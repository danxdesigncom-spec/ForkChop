import type { MatchOptions, Recipe } from '../types';
import type { RecipeSource } from './types';
import { matchRecipes } from '../matching/match';
import { createLocalSource } from './local-source';
import { createSpoonacularSource } from './spoonacular/source';

export * from './types';

/**
 * Combines every recipe source behind one call.
 *
 * Free sources are consulted first. Metered ones are only reached for when the
 * free results come up short, which is what keeps a 150-point daily allowance
 * from evaporating during development. Adding TheMealDB means one more entry in
 * `metered: false` here.
 */

/**
 * Below this many genuinely cookable local matches, it is worth spending a
 * request to widen the net. Someone with a well-stocked pantry never triggers
 * it; someone with three ingredients and nothing to cook always does.
 */
export const THIN_RESULTS_THRESHOLD = 5;

export function listRecipeSources(): RecipeSource[] {
  return [createLocalSource(), createSpoonacularSource()];
}

export interface AggregateInput {
  pantryIngredientIds: string[];
  pantryIngredientNames: string[];
  options: MatchOptions;
  limit?: number;
}

export interface AggregateResult {
  recipes: Recipe[];
  notices: string[];
  /** Which sources actually contributed, for the API response and tests. */
  sourcesUsed: string[];
}

/**
 * How many local recipes are actually cookable right now.
 *
 * Counts `ready` matches rather than total results, because a hundred recipes
 * you cannot cook is not a useful answer — that is exactly the case where
 * reaching out is worth a quota point.
 */
function countReady(recipes: Recipe[], input: AggregateInput): number {
  return matchRecipes(recipes, input.pantryIngredientIds, input.options).filter(
    (m) => m.status === 'ready',
  ).length;
}

export async function searchAllSources(input: AggregateInput): Promise<AggregateResult> {
  const limit = input.limit ?? 20;
  const sources = listRecipeSources();
  const notices: string[] = [];
  const sourcesUsed: string[] = [];

  const free = sources.filter((s) => s.configured && !s.metered);
  const metered = sources.filter((s) => s.configured && s.metered);

  const collected: Recipe[] = [];

  for (const source of free) {
    const result = await source.search({ ...input, limit });
    if (result.recipes.length > 0) sourcesUsed.push(source.id);
    collected.push(...result.recipes);
    notices.push(...result.notices);
  }

  // Nothing in the pantry means nothing to search for; skip the paid call.
  const readyCount = input.pantryIngredientIds.length > 0 ? countReady(collected, input) : 0;
  const needsMore = input.pantryIngredientIds.length > 0 && readyCount < THIN_RESULTS_THRESHOLD;

  if (needsMore) {
    for (const source of metered) {
      const result = await source.search({ ...input, limit });
      if (result.recipes.length > 0) sourcesUsed.push(source.id);
      collected.push(...result.recipes);
      notices.push(...result.notices);
    }
  }

  return { recipes: dedupeRecipes(collected), notices, sourcesUsed };
}

/**
 * Drops external duplicates of recipes we already have.
 *
 * Spoonacular carries plenty of near-identical takes on the same dish, and a
 * results page listing three "Spaghetti Aglio e Olio" reads as broken. Local
 * wins ties, because its ingredient importance weights make it score better.
 */
export function dedupeRecipes(recipes: Recipe[]): Recipe[] {
  const byId = new Set<string>();
  const byTitle = new Map<string, Recipe>();
  const out: Recipe[] = [];

  const normaliseTitle = (title: string) =>
    title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  for (const recipe of recipes) {
    if (byId.has(recipe.id)) continue;

    const titleKey = normaliseTitle(recipe.title);
    const existing = byTitle.get(titleKey);

    if (existing) {
      const existingIsLocal = (existing.sourceId ?? 'local') === 'local';
      const candidateIsLocal = (recipe.sourceId ?? 'local') === 'local';
      // Only a local recipe may displace an external one already collected.
      if (!(candidateIsLocal && !existingIsLocal)) continue;

      const index = out.indexOf(existing);
      if (index >= 0) out.splice(index, 1);
      byId.delete(existing.id);
    }

    byId.add(recipe.id);
    byTitle.set(titleKey, recipe);
    out.push(recipe);
  }

  return out;
}
