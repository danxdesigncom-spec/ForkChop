import type { Recipe } from './types';

/**
 * Whether a recipe is spicy, and whether that heat is avoidable.
 *
 * Single source of truth for both the 🌶️ badge and the "no spicy food" filter,
 * so the thing the badge claims and the thing the filter removes can never
 * drift apart.
 */
export interface RecipeHeat {
  /** A required ingredient brings heat — you cannot cook this mild. */
  spicy: boolean;
  /** Heat comes only from optional extras, so it is entirely up to the cook. */
  optionalOnly: boolean;
  /** Names of the ingredients responsible, for the tooltip. */
  sources: string[];
}

export function recipeHeat(recipe: Recipe): RecipeHeat {
  const required: string[] = [];
  const optional: string[] = [];

  for (const ingredient of recipe.ingredients) {
    if (!ingredient.isSpicy) continue;
    (ingredient.importance === 'optional' ? optional : required).push(ingredient.name);
  }

  return {
    spicy: required.length > 0,
    optionalOnly: required.length === 0 && optional.length > 0,
    sources: [...required, ...optional],
  };
}

/** True when the recipe should carry a chilli badge at all. */
export function hasHeat(heat: RecipeHeat): boolean {
  return heat.spicy || heat.optionalOnly;
}
