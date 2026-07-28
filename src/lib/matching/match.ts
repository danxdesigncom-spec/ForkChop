import type { MatchOptions, MatchStatus, Recipe, RecipeIngredient, RecipeMatch } from '../types';
import { recipeHeat } from '../spice';
import { recipeMeetsDiet } from '../taxonomy';

/**
 * Ranks recipes against a pantry.
 *
 * Pure and dependency-free on purpose — it takes plain recipes and a set of
 * ingredient ids, so it can be unit tested without touching the database.
 */

/** How much each required ingredient counts toward coverage. */
const IMPORTANCE_WEIGHT = { core: 3, normal: 1, optional: 0 } as const;

/**
 * Ranking weights. Coverage dominates; utilization stops a two-ingredient
 * recipe from beating a genuinely good match just because it is small; the
 * optional bonus is a tiebreaker between otherwise equal recipes.
 */
const W_COVERAGE = 0.72;
const W_UTILIZATION = 0.18;
const W_OPTIONAL = 0.1;

/** Above this many missing required ingredients, a recipe stops being "almost". */
const ALMOST_THRESHOLD = 3;

const STATUS_RANK: Record<MatchStatus, number> = { ready: 0, almost: 1, stretch: 2 };

export function scoreRecipe(
  recipe: Recipe,
  pantry: Set<string>,
  options: MatchOptions = {},
): RecipeMatch {
  const assumeStaples = options.assumeStaples ?? true;

  const have: RecipeIngredient[] = [];
  const missing: RecipeIngredient[] = [];
  const optionalMissing: RecipeIngredient[] = [];
  const assumedStaples: RecipeIngredient[] = [];
  const usedPantryIds: string[] = [];

  let haveWeight = 0;
  let requiredWeight = 0;
  let optionalTotal = 0;
  let optionalHave = 0;

  for (const ingredient of recipe.ingredients) {
    const inPantry = pantry.has(ingredient.id);
    if (inPantry) usedPantryIds.push(ingredient.id);

    if (ingredient.importance === 'optional') {
      optionalTotal += 1;
      if (inPantry) {
        optionalHave += 1;
        have.push(ingredient);
      } else {
        optionalMissing.push(ingredient);
      }
      continue;
    }

    // A staple the user did not list is assumed present rather than counted
    // against the recipe — it is excluded from coverage entirely, so a pantry
    // of "chicken, rice" is not penalised for not mentioning salt.
    if (!inPantry && assumeStaples && ingredient.isStaple) {
      assumedStaples.push(ingredient);
      continue;
    }

    const weight = IMPORTANCE_WEIGHT[ingredient.importance];
    requiredWeight += weight;

    if (inPantry) {
      haveWeight += weight;
      have.push(ingredient);
    } else {
      missing.push(ingredient);
    }
  }

  const coverage = requiredWeight === 0 ? 1 : haveWeight / requiredWeight;
  const utilization = pantry.size === 0 ? 0 : usedPantryIds.length / pantry.size;
  const optionalBonus = optionalTotal === 0 ? 0 : optionalHave / optionalTotal;

  const score = W_COVERAGE * coverage + W_UTILIZATION * utilization + W_OPTIONAL * optionalBonus;

  const status: MatchStatus =
    missing.length === 0 ? 'ready' : missing.length <= ALMOST_THRESHOLD ? 'almost' : 'stretch';

  // Missing items sort by importance so the UI can lead with what actually
  // matters ("you need the chicken") rather than an alphabetical accident.
  missing.sort(
    (a, b) =>
      IMPORTANCE_WEIGHT[b.importance] - IMPORTANCE_WEIGHT[a.importance] || a.name.localeCompare(b.name),
  );

  return {
    recipe,
    score,
    coverage,
    status,
    have,
    missing,
    optionalMissing,
    assumedStaples,
    usedPantryIds,
  };
}

/**
 * True when a recipe must not be shown at all.
 *
 * Allergens are strict — one trace in an optional garnish is enough to drop the
 * recipe, because the cost of a false negative is a reaction, not a missed
 * dinner. Dislikes are lenient — an unwanted garnish can simply be left out, so
 * only a required ingredient disqualifies.
 */
export function isExcluded(recipe: Recipe, options: MatchOptions = {}): boolean {
  const allergens = options.excludeAllergens;
  if (allergens && allergens.length > 0) {
    const avoid = new Set(allergens);
    for (const ingredient of recipe.ingredients) {
      if (ingredient.allergens.some((a) => avoid.has(a))) return true;
    }
  }

  const disliked = options.dislikedIngredientIds;
  if (disliked && disliked.length > 0) {
    const avoid = new Set(disliked);
    for (const ingredient of recipe.ingredients) {
      if (ingredient.importance === 'optional') continue;
      if (avoid.has(ingredient.id)) return true;
    }
  }

  // Same leniency: only unavoidable heat disqualifies. A recipe whose chilli is
  // an optional garnish can simply be cooked without it.
  if (options.excludeSpicy && recipeHeat(recipe).spicy) return true;

  return false;
}

export function matchRecipes(
  recipes: Recipe[],
  pantryIds: string[],
  options: MatchOptions = {},
): RecipeMatch[] {
  const pantry = new Set(pantryIds);

  // Exclusions are absolute, so they run before scoring rather than as one more
  // ranking signal — an allergen is not something to merely rank down.
  let matches = recipes.filter((r) => !isExcluded(r, options)).map((recipe) => scoreRecipe(recipe, pantry, options));

  // With an empty pantry every recipe scores identically, so there is nothing
  // meaningful to recommend. Callers show the empty state instead.
  if (pantry.size === 0) return [];

  // Recipes sharing nothing with the pantry are noise, not recommendations.
  matches = matches.filter((m) => m.usedPantryIds.length > 0);

  if (options.tags?.length) {
    const wanted = options.tags;
    matches = matches.filter((m) => wanted.every((tag) => m.recipe.tags.includes(tag)));
  }

  // Diets stack — picking vegan *and* gluten-free means both must hold.
  if (options.diets?.length) {
    const wanted = options.diets;
    matches = matches.filter((m) => wanted.every((diet) => recipeMeetsDiet(m.recipe, diet)));
  }

  // Regions and meals widen — picking Asian and American means either is fine,
  // which is what a person means when they tick two cuisines.
  if (options.regions?.length) {
    const wanted = new Set(options.regions);
    matches = matches.filter((m) => wanted.has(m.recipe.region));
  }

  if (options.mealTypes?.length) {
    const wanted = new Set(options.mealTypes);
    matches = matches.filter((m) => m.recipe.mealTypes.some((meal) => wanted.has(meal)));
  }

  if (options.maxTotalMinutes != null) {
    matches = matches.filter((m) => m.recipe.totalMinutes <= options.maxTotalMinutes!);
  }

  if (options.maxMissing != null) {
    matches = matches.filter((m) => m.missing.length <= options.maxMissing!);
  }

  matches.sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      b.score - a.score ||
      a.missing.length - b.missing.length ||
      a.recipe.totalMinutes - b.recipe.totalMinutes ||
      a.recipe.title.localeCompare(b.recipe.title),
  );

  return options.limit != null ? matches.slice(0, options.limit) : matches;
}

/**
 * Ingredients that would unlock the most additional recipes if bought — the
 * "add this one thing to your basket" nudge, and the natural hook for the
 * grocery integration.
 */
export function suggestUnlocks(
  matches: RecipeMatch[],
  limit = 5,
): { ingredient: RecipeIngredient; unlocks: number; recipes: string[] }[] {
  const tally = new Map<string, { ingredient: RecipeIngredient; recipes: string[] }>();

  for (const match of matches) {
    // Only recipes a single ingredient away are genuinely "unlockable".
    if (match.missing.length !== 1) continue;
    const missing = match.missing[0];
    const entry = tally.get(missing.id) ?? { ingredient: missing, recipes: [] };
    entry.recipes.push(match.recipe.title);
    tally.set(missing.id, entry);
  }

  return [...tally.values()]
    .map((e) => ({ ingredient: e.ingredient, unlocks: e.recipes.length, recipes: e.recipes }))
    .sort((a, b) => b.unlocks - a.unlocks || a.ingredient.name.localeCompare(b.ingredient.name))
    .slice(0, limit);
}
