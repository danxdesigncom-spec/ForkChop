import type { MatchOptions, Recipe } from '../types';

/**
 * A catalogue ForkChop can search.
 *
 * Every source returns recipes in the app's existing `Recipe` shape, which is
 * the whole point of this seam: `matchRecipes()` scores and filters them
 * without knowing or caring where they came from, so all nine existing filters
 * and the ready/almost/stretch logic apply to external recipes for free.
 *
 * Adding TheMealDB later means writing one more implementation of this
 * interface and registering it — no changes to the matcher, the API routes or
 * the UI.
 */
export interface RecipeSearchInput {
  /** Canonical ingredient ids resolved from the user's pantry. */
  pantryIngredientIds: string[];
  /** Human-readable names for the same ingredients, for sources that want text. */
  pantryIngredientNames: string[];
  /** The filters already selected in the UI, so sources can pre-filter server-side. */
  options: MatchOptions;
  /** Upper bound on recipes to return. */
  limit: number;
}

export interface RecipeSearchResult {
  recipes: Recipe[];
  /**
   * Non-fatal problems — quota exhausted, upstream down, allergens unmappable.
   * Surfaced to the user rather than swallowed, so a suddenly shorter list is
   * explainable.
   */
  notices: string[];
}

export interface RecipeSource {
  id: string;
  name: string;
  /** False when credentials are missing; the aggregator skips it silently. */
  configured: boolean;
  /** What an operator must do to connect it. */
  setupHint?: string;
  /**
   * True for sources that cost money or quota per call. The aggregator only
   * reaches for these when the free sources come up short.
   */
  metered: boolean;
  search(input: RecipeSearchInput): Promise<RecipeSearchResult>;
  /** Fetch one recipe by its id within this source, for saving and re-display. */
  getById?(id: string): Promise<Recipe | null>;
}
