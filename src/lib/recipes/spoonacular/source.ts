import type { RecipeSource, RecipeSearchInput, RecipeSearchResult } from '../types';
import { getLexicon } from '../../matching/lexicon';
import { complexSearch, getRecipeInformation, isConfigured, SpoonacularError } from './client';
import { mapSpoonacularRecipe } from './map';
import {
  DIET_AS_INTOLERANCE,
  DIET_PARAM,
  hasUnmappableAllergen,
  toCuisines,
  toIntolerances,
  toMealTypeParams,
} from './taxonomy';

export const SPOONACULAR_SETUP_HINT =
  'Set SPOONACULAR_API_KEY (server-side only) to search the Spoonacular catalogue.';

/**
 * Spoonacular as a ForkChop recipe source.
 *
 * Metered, so the aggregator only calls it when the local corpus comes up
 * short. Every failure mode degrades to "local results only, with a notice"
 * rather than breaking the search.
 */
export function createSpoonacularSource(): RecipeSource {
  return {
    id: 'spoonacular',
    name: 'Spoonacular',
    configured: isConfigured(),
    setupHint: SPOONACULAR_SETUP_HINT,
    metered: true,

    async search(input: RecipeSearchInput): Promise<RecipeSearchResult> {
      const { options } = input;

      if (!isConfigured()) return { recipes: [], notices: [] };

      /**
       * Hard stop: Spoonacular cannot filter mustard or celery, so it cannot
       * promise a recipe is free of them. Withholding external results is the
       * same call Phase 1 made for allergens generally — a missed dinner beats
       * a reaction.
       */
      if (hasUnmappableAllergen(options.excludeAllergens)) {
        return {
          recipes: [],
          notices: [
            'Showing our own recipes only: the wider catalogue can’t filter mustard or celery allergies.',
          ],
        };
      }

      if (input.pantryIngredientNames.length === 0) {
        return { recipes: [], notices: [] };
      }

      // Diets split across two Spoonacular parameters.
      const diets = (options.diets ?? []).flatMap((d) => (DIET_PARAM[d] ? [DIET_PARAM[d]] : []));
      const dietIntolerances = (options.diets ?? []).flatMap((d) => DIET_AS_INTOLERANCE[d] ?? []);
      const intolerances = [...new Set([...toIntolerances(options.excludeAllergens), ...dietIntolerances])];

      try {
        const raw = await complexSearch({
          // Spoonacular matches on names, not our ids.
          includeIngredients: input.pantryIngredientNames.slice(0, 20),
          intolerances,
          diets,
          cuisines: toCuisines(options.regions),
          mealTypes: toMealTypeParams(options.mealTypes),
          maxReadyTime: options.maxTotalMinutes,
          number: Math.min(input.limit, 20),
        });

        const lexicon = getLexicon();
        const recipes = raw.flatMap((item) => {
          const mapped = mapSpoonacularRecipe(item, lexicon);
          return mapped ? [mapped] : [];
        });

        return { recipes, notices: [] };
      } catch (error) {
        if (error instanceof SpoonacularError) {
          // Quota and auth problems are worth telling the user about, because
          // the result list is shorter than it would otherwise be.
          const notice =
            error.kind === 'quota'
              ? 'The wider recipe catalogue has hit its daily limit — showing our own recipes.'
              : error.kind === 'auth'
                ? 'The wider recipe catalogue is misconfigured — showing our own recipes.'
                : 'Couldn’t reach the wider recipe catalogue — showing our own recipes.';
          return { recipes: [], notices: [notice] };
        }
        return {
          recipes: [],
          notices: ['Couldn’t reach the wider recipe catalogue — showing our own recipes.'],
        };
      }
    },

    async getById(id: string) {
      const numeric = Number(id.replace(/^spoonacular-/, ''));
      if (!Number.isFinite(numeric)) return null;

      try {
        const raw = await getRecipeInformation(numeric);
        return raw ? mapSpoonacularRecipe(raw, getLexicon()) : null;
      } catch {
        return null;
      }
    },
  };
}
