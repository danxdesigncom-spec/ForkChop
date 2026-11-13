import type { RecipeMatch } from './types';
import { MEAL_TYPES, type MealType } from './taxonomy';

/**
 * How the My Recipes view is grouped.
 *
 *   flat        - one list, sorted by coverage (today's behaviour)
 *   meal-type   - grouped into breakfast/brunch/lunch/etc, in that order
 *   match       - grouped into "cook tonight" / "almost there" / "worth a
 *                 shop", by status (mirrors the main Discover view)
 *
 * `flat` is the default so this feature is invisible until the user opts in.
 */
export type SavedGroupBy = 'flat' | 'meal-type' | 'match';

export interface SavedGroup {
  /** Stable id for React keys and for a data-attribute in tests. */
  id: string;
  /** What the user sees at the top of the group. */
  label: string;
  /** Small emoji to match the sidebar filter chips. */
  emoji?: string;
  matches: RecipeMatch[];
}

const MEAL_META = new Map<MealType, { label: string; emoji: string; order: number }>(
  MEAL_TYPES.map((meal, index) => [meal.id, { label: meal.label, emoji: meal.emoji, order: index }]),
);

/**
 * A recipe belonging to two meals (pancakes: breakfast + brunch) appears
 * under both. That's how the sidebar meal filter already works, so keeping
 * the same behaviour here means users see the same grouping semantics
 * everywhere.
 */
function groupByMealType(matches: RecipeMatch[]): SavedGroup[] {
  const buckets = new Map<string, RecipeMatch[]>();
  const other: RecipeMatch[] = [];

  for (const match of matches) {
    const meals = match.recipe.mealTypes;
    if (!meals || meals.length === 0) {
      other.push(match);
      continue;
    }
    for (const meal of meals) {
      const bucket = buckets.get(meal) ?? [];
      bucket.push(match);
      buckets.set(meal, bucket);
    }
  }

  const groups: SavedGroup[] = [...buckets.entries()]
    // Sort ids by the meal's canonical order, then map to the display shape.
    // Doing it this way avoids stashing the sort key on the object.
    .sort(([a], [b]) => {
      const ao = MEAL_META.get(a as MealType)?.order ?? Number.MAX_SAFE_INTEGER;
      const bo = MEAL_META.get(b as MealType)?.order ?? Number.MAX_SAFE_INTEGER;
      return ao - bo;
    })
    .map(([id, list]) => {
      const meta = MEAL_META.get(id as MealType);
      return { id, label: meta?.label ?? id, emoji: meta?.emoji, matches: list };
    });

  if (other.length > 0) {
    groups.push({ id: 'other', label: 'Other', emoji: '🍽️', matches: other });
  }
  return groups;
}

/**
 * Groups by whether the user could cook the recipe right now. Same three
 * buckets and same status colouring as the Discover view, so nothing is
 * relearnt.
 */
const MATCH_ORDER: RecipeMatch['status'][] = ['ready', 'almost', 'stretch'];
const MATCH_META: Record<RecipeMatch['status'], { label: string; emoji: string }> = {
  ready: { label: 'Cook tonight', emoji: '🍳' },
  almost: { label: 'Almost there', emoji: '🛒' },
  stretch: { label: 'Worth a shop', emoji: '📝' },
};

function groupByMatch(matches: RecipeMatch[]): SavedGroup[] {
  const buckets = new Map<RecipeMatch['status'], RecipeMatch[]>();
  for (const match of matches) {
    const list = buckets.get(match.status) ?? [];
    list.push(match);
    buckets.set(match.status, list);
  }
  return MATCH_ORDER.flatMap((status) => {
    const list = buckets.get(status);
    return list?.length
      ? [{ id: status, label: MATCH_META[status].label, emoji: MATCH_META[status].emoji, matches: list }]
      : [];
  });
}

export function groupSavedRecipes(matches: RecipeMatch[], by: SavedGroupBy): SavedGroup[] {
  if (by === 'meal-type') return groupByMealType(matches);
  if (by === 'match') return groupByMatch(matches);
  return matches.length > 0
    ? [{ id: 'all', label: `${matches.length} saved`, matches }]
    : [];
}
