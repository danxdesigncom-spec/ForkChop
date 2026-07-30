import { describe, expect, it } from 'vitest';
import { groupSavedRecipes } from '@/lib/saved-grouping';
import type { RecipeMatch } from '@/lib/types';

const match = (over: Partial<RecipeMatch['recipe']>, status: RecipeMatch['status'] = 'ready'): RecipeMatch =>
  ({
    recipe: {
      id: 'x',
      slug: 'x',
      title: 'X',
      description: '',
      cuisine: 'test',
      region: 'other',
      mealTypes: ['dinner'],
      diets: [],
      servings: 2,
      prepMinutes: 5,
      cookMinutes: 10,
      totalMinutes: 15,
      difficulty: 'easy',
      emoji: '🍽️',
      tags: [],
      instructions: [],
      ingredients: [],
      ...over,
    },
    score: 1,
    coverage: 1,
    status,
    have: [],
    missing: [],
    optionalMissing: [],
    assumedStaples: [],
    usedPantryIds: [],
  }) as RecipeMatch;

describe('groupSavedRecipes — flat', () => {
  it('returns a single "N saved" group', () => {
    const groups = groupSavedRecipes([match({}), match({})], 'flat');
    expect(groups).toEqual([{ id: 'all', label: '2 saved', matches: expect.any(Array) }]);
    expect(groups[0].matches).toHaveLength(2);
  });

  it('returns nothing for an empty list', () => {
    expect(groupSavedRecipes([], 'flat')).toEqual([]);
  });
});

describe('groupSavedRecipes — by meal type', () => {
  it('groups into declared meals', () => {
    const groups = groupSavedRecipes(
      [
        match({ id: 'a', mealTypes: ['breakfast'] }),
        match({ id: 'b', mealTypes: ['dinner'] }),
        match({ id: 'c', mealTypes: ['dinner'] }),
      ],
      'meal-type',
    );
    expect(groups.map((g) => [g.id, g.matches.length])).toEqual([
      ['breakfast', 1],
      ['dinner', 2],
    ]);
  });

  it('places multi-meal recipes in every relevant group', () => {
    // A pancake belongs to both breakfast and brunch — same as the sidebar
    // meal filter, so both views agree.
    const groups = groupSavedRecipes(
      [match({ id: 'pancakes', mealTypes: ['breakfast', 'brunch'] })],
      'meal-type',
    );
    expect(groups.map((g) => g.id)).toEqual(['breakfast', 'brunch']);
    for (const g of groups) expect(g.matches[0].recipe.id).toBe('pancakes');
  });

  it('orders groups by the canonical meal order, not insertion order', () => {
    const groups = groupSavedRecipes(
      [
        match({ id: 'a', mealTypes: ['dinner'] }),
        match({ id: 'b', mealTypes: ['breakfast'] }),
        match({ id: 'c', mealTypes: ['lunch'] }),
      ],
      'meal-type',
    );
    expect(groups.map((g) => g.id)).toEqual(['breakfast', 'lunch', 'dinner']);
  });

  it('sends recipes with no declared meal to an "Other" bucket at the end', () => {
    const groups = groupSavedRecipes(
      [
        match({ id: 'a', mealTypes: [] }),
        match({ id: 'b', mealTypes: ['dinner'] }),
      ],
      'meal-type',
    );
    expect(groups.map((g) => g.id)).toEqual(['dinner', 'other']);
  });
});

describe('groupSavedRecipes — by match', () => {
  it('groups by cook-tonight / almost / stretch, in that order', () => {
    const groups = groupSavedRecipes(
      [
        match({ id: 'a' }, 'stretch'),
        match({ id: 'b' }, 'ready'),
        match({ id: 'c' }, 'almost'),
        match({ id: 'd' }, 'ready'),
      ],
      'match',
    );
    expect(groups.map((g) => [g.id, g.matches.length])).toEqual([
      ['ready', 2],
      ['almost', 1],
      ['stretch', 1],
    ]);
  });

  it('omits an empty status group entirely', () => {
    const groups = groupSavedRecipes([match({ id: 'a' }, 'ready')], 'match');
    expect(groups.map((g) => g.id)).toEqual(['ready']);
  });
});
