import type { RegionId } from '../../taxonomy';

/**
 * Translation between ForkChop's filter vocabulary and Spoonacular's.
 *
 * Kept in one file so the gaps are visible in one place rather than scattered
 * through request-building code. The gaps matter: two of our allergens have no
 * Spoonacular equivalent at all.
 */

// ------------------------------------------------------------- allergens

/**
 * Our allergen ids -> Spoonacular `intolerances` values.
 *
 * Nine of eleven map. `mustard` and `celery` are deliberately absent because
 * Spoonacular does not support them — see UNMAPPABLE_ALLERGENS.
 */
export const INTOLERANCE_BY_ALLERGEN: Record<string, string> = {
  dairy: 'Dairy',
  egg: 'Egg',
  gluten: 'Gluten',
  peanut: 'Peanut',
  'tree-nut': 'Tree Nut',
  sesame: 'Sesame',
  soy: 'Soy',
  shellfish: 'Shellfish',
  // Spoonacular has no fish-only value; Seafood is the closest and is broader,
  // which errs toward excluding too much rather than too little.
  fish: 'Seafood',
};

/**
 * Allergens Spoonacular cannot filter on.
 *
 * When a user selects one of these we do not query external sources at all.
 * Their allergen data would be unverifiable, and Phase 1 established the rule
 * that a false negative costs a reaction while a false positive costs one
 * dinner.
 */
export const UNMAPPABLE_ALLERGENS = new Set(['mustard', 'celery']);

export function toIntolerances(allergens: string[] | undefined): string[] {
  if (!allergens?.length) return [];
  return allergens.flatMap((a) => {
    const mapped = INTOLERANCE_BY_ALLERGEN[a];
    return mapped ? [mapped] : [];
  });
}

/** True when the selected allergens include something we cannot map. */
export function hasUnmappableAllergen(allergens: string[] | undefined): boolean {
  return Boolean(allergens?.some((a) => UNMAPPABLE_ALLERGENS.has(a)));
}

// ----------------------------------------------------------------- diets

/**
 * Our diet ids -> Spoonacular `diet` values.
 *
 * `dairy-free` and `nut-free` are not Spoonacular diets; they are expressed as
 * intolerances instead, which is why they map to extra intolerance values
 * rather than a diet string.
 */
export const DIET_PARAM: Record<string, string> = {
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  'gluten-free': 'Gluten Free',
};

export const DIET_AS_INTOLERANCE: Record<string, string[]> = {
  'dairy-free': ['Dairy'],
  'nut-free': ['Peanut', 'Tree Nut'],
};

// --------------------------------------------------------------- cuisines

/** Spoonacular cuisine -> our broad region. Anything unlisted becomes 'other'. */
const REGION_BY_CUISINE: Record<string, RegionId> = {
  italian: 'mediterranean',
  greek: 'mediterranean',
  mediterranean: 'mediterranean',
  spanish: 'mediterranean',
  chinese: 'asian',
  japanese: 'asian',
  thai: 'asian',
  indian: 'asian',
  korean: 'asian',
  vietnamese: 'asian',
  asian: 'asian',
  american: 'american',
  mexican: 'american',
  'latin american': 'american',
  southern: 'american',
  cajun: 'american',
  caribbean: 'american',
  british: 'european',
  french: 'european',
  german: 'european',
  irish: 'european',
  nordic: 'european',
  'eastern european': 'european',
  european: 'european',
  'middle eastern': 'middle-eastern',
  jewish: 'middle-eastern',
  african: 'other',
};

export function regionFromCuisines(cuisines: string[] | undefined): RegionId {
  for (const cuisine of cuisines ?? []) {
    const region = REGION_BY_CUISINE[cuisine.toLowerCase()];
    if (region) return region;
  }
  return 'other';
}

/** Our region -> the Spoonacular cuisines that belong to it. */
const CUISINES_BY_REGION: Record<string, string[]> = {
  mediterranean: ['Mediterranean', 'Italian', 'Greek', 'Spanish'],
  asian: ['Chinese', 'Japanese', 'Thai', 'Indian', 'Korean', 'Vietnamese'],
  american: ['American', 'Mexican', 'Latin American', 'Southern', 'Cajun', 'Caribbean'],
  european: ['British', 'French', 'German', 'Irish', 'Nordic', 'Eastern European'],
  'middle-eastern': ['Middle Eastern'],
  other: ['African'],
};

export function toCuisines(regions: string[] | undefined): string[] {
  if (!regions?.length) return [];
  return regions.flatMap((r) => CUISINES_BY_REGION[r] ?? []);
}

// ------------------------------------------------------------ meal types

/**
 * Our meal ids -> Spoonacular `type` values.
 *
 * Lossy in one direction: Spoonacular has no lunch/dinner distinction, so both
 * map to `main course`. Filtering for lunch therefore also returns dinners.
 * Erring toward showing a usable recipe is the right side of that trade.
 */
const TYPE_BY_MEAL: Record<string, string[]> = {
  breakfast: ['breakfast'],
  brunch: ['breakfast'],
  lunch: ['main course'],
  dinner: ['main course'],
  snack: ['snack', 'appetizer', 'fingerfood'],
  dessert: ['dessert'],
  side: ['side dish', 'salad'],
};

export function toMealTypeParams(mealTypes: string[] | undefined): string[] {
  if (!mealTypes?.length) return [];
  return [...new Set(mealTypes.flatMap((m) => TYPE_BY_MEAL[m] ?? []))];
}

/** Spoonacular `dishTypes` -> our meal ids. */
const MEALS_BY_DISH_TYPE: Record<string, string[]> = {
  breakfast: ['breakfast', 'brunch'],
  brunch: ['brunch', 'breakfast'],
  'main course': ['lunch', 'dinner'],
  'main dish': ['lunch', 'dinner'],
  dessert: ['dessert'],
  snack: ['snack'],
  appetizer: ['snack'],
  fingerfood: ['snack'],
  'side dish': ['side'],
  salad: ['side', 'lunch'],
  soup: ['lunch', 'dinner'],
  bread: ['side'],
};

export function mealTypesFromDishTypes(dishTypes: string[] | undefined): string[] {
  const meals = new Set<string>();
  for (const dish of dishTypes ?? []) {
    for (const meal of MEALS_BY_DISH_TYPE[dish.toLowerCase()] ?? []) meals.add(meal);
  }
  // Something must be set or the recipe vanishes the moment any meal filter is
  // applied; dinner is the least surprising default for an unlabelled dish.
  if (meals.size === 0) meals.add('dinner');
  return [...meals];
}
