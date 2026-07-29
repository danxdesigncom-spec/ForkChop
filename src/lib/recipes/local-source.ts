import type { RecipeSource, RecipeSearchResult } from './types';
import { getAllRecipes, getRecipeBySlug } from '../db/queries';

/**
 * The bundled 60-recipe corpus.
 *
 * Returns everything and lets `matchRecipes()` do the filtering, exactly as
 * before this abstraction existed — the whole corpus is small enough that
 * loading it and scoring in memory is faster than any query would be.
 *
 * Free and offline, so the aggregator always consults it first.
 */
export function createLocalSource(): RecipeSource {
  return {
    id: 'local',
    name: 'ForkChop originals',
    configured: true,
    metered: false,

    async search(): Promise<RecipeSearchResult> {
      return { recipes: getAllRecipes(), notices: [] };
    },

    async getById(id: string) {
      return getRecipeBySlug(id);
    },
  };
}
