import type { Recipe } from './types';

/**
 * The three ways a user can narrow the corpus beyond their pantry: what part of
 * the world a dish comes from, what meal it belongs to, and what it does or
 * does not contain.
 *
 * Regions and diets are both *derived* rather than stored. A recipe declares a
 * specific cuisine ("Greek") and its ingredient list declares its allergens;
 * grouping those into "Mediterranean" and "Gluten-free" here means the filters
 * can never disagree with the underlying data.
 */

// ---------------------------------------------------------------- meal types

export type MealType = 'breakfast' | 'brunch' | 'lunch' | 'dinner' | 'snack' | 'dessert' | 'side';

export const MEAL_TYPES: { id: MealType; label: string; emoji: string }[] = [
  { id: 'breakfast', label: 'Breakfast', emoji: '🍳' },
  { id: 'brunch', label: 'Brunch', emoji: '🥂' },
  { id: 'lunch', label: 'Lunch', emoji: '🥪' },
  { id: 'dinner', label: 'Dinner', emoji: '🍽️' },
  { id: 'snack', label: 'Snacks', emoji: '🥨' },
  { id: 'dessert', label: 'Desserts', emoji: '🍰' },
  { id: 'side', label: 'Sides', emoji: '🥗' },
];

// ------------------------------------------------------------------- regions

export const REGIONS = [
  { id: 'mediterranean', label: 'Mediterranean', emoji: '🫒' },
  { id: 'asian', label: 'Asian', emoji: '🥢' },
  { id: 'american', label: 'American', emoji: '🌎' },
  { id: 'european', label: 'European', emoji: '🥖' },
  { id: 'middle-eastern', label: 'Middle Eastern', emoji: '🧆' },
  { id: 'other', label: 'Other', emoji: '🌍' },
] as const;

export type RegionId = (typeof REGIONS)[number]['id'];

/** Specific cuisine (as stored on the recipe) -> broad region. */
const REGION_BY_CUISINE: Record<string, RegionId> = {
  Italian: 'mediterranean',
  Greek: 'mediterranean',
  Mediterranean: 'mediterranean',
  Chinese: 'asian',
  Japanese: 'asian',
  Thai: 'asian',
  Indian: 'asian',
  American: 'american',
  'Tex-Mex': 'american',
  Mexican: 'american',
  British: 'european',
  French: 'european',
  Scandinavian: 'european',
  'Middle Eastern': 'middle-eastern',
  Fusion: 'other',
};

export function regionForCuisine(cuisine: string): RegionId {
  return REGION_BY_CUISINE[cuisine] ?? 'other';
}

export function regionLabel(id: string): string {
  return REGIONS.find((r) => r.id === id)?.label ?? id;
}

// --------------------------------------------------------------------- diets

export const DIETS = [
  { id: 'vegetarian', label: 'Vegetarian', emoji: '🥦' },
  { id: 'vegan', label: 'Vegan', emoji: '🌱' },
  { id: 'gluten-free', label: 'Gluten-free', emoji: '🌾' },
  { id: 'dairy-free', label: 'Dairy-free', emoji: '🥛' },
  { id: 'nut-free', label: 'Nut-free', emoji: '🥜' },
] as const;

export type DietId = (typeof DIETS)[number]['id'];

/**
 * "Free-from" diets are derived from the same allergen tags the allergy filter
 * uses, and are strict for the same reason: an optional parmesan garnish still
 * means the recipe as written contains dairy.
 *
 * Vegetarian and vegan stay author-declared tags — no ingredient property can
 * tell you whether the stock in a soup was made from chicken.
 */
const ALLERGEN_FOR_FREE_FROM: Record<string, string[]> = {
  'gluten-free': ['gluten'],
  'dairy-free': ['dairy'],
  'nut-free': ['peanut', 'tree-nut'],
};

export function recipeMeetsDiet(recipe: Recipe, diet: string): boolean {
  if (diet === 'vegetarian' || diet === 'vegan') {
    return recipe.tags.includes(diet);
  }

  const allergens = ALLERGEN_FOR_FREE_FROM[diet];
  if (!allergens) return true; // Unknown diet: do not silently hide everything.

  return !recipe.ingredients.some((ingredient) =>
    ingredient.allergens.some((a) => allergens.includes(a)),
  );
}

export function dietsForRecipe(recipe: Recipe): string[] {
  return DIETS.map((d) => d.id).filter((id) => recipeMeetsDiet(recipe, id));
}
