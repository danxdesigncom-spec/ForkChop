import { describe, expect, it } from 'vitest';
import { matchRecipes, scoreRecipe, suggestUnlocks } from '@/lib/matching/match';
import type { Importance, Recipe, RecipeIngredient } from '@/lib/types';
import { hasHeat, recipeHeat } from '@/lib/spice';

/** Minimal recipe builder so tests state only what they care about. */
function ing(
  id: string,
  importance: Importance = 'normal',
  isStaple = false,
  allergens: string[] = [],
  isSpicy = false,
): RecipeIngredient {
  return {
    id,
    name: id,
    category: 'pantry',
    isStaple,
    allergens,
    isSpicy,
    quantity: null,
    unit: null,
    note: null,
    importance,
  };
}

function recipe(id: string, ingredients: RecipeIngredient[], overrides: Partial<Recipe> = {}): Recipe {
  return {
    id,
    slug: id,
    title: id,
    description: '',
    cuisine: 'test',
    mealTypes: ['dinner'],
    region: 'other',
    diets: [],
    servings: 2,
    prepMinutes: 5,
    cookMinutes: 10,
    totalMinutes: 15,
    difficulty: 'easy',
    emoji: '🍳',
    tags: [],
    instructions: [],
    ingredients,
    ...overrides,
  };
}

describe('scoreRecipe', () => {
  it('reports a fully-stocked recipe as ready', () => {
    const r = recipe('r', [ing('a', 'core'), ing('b')]);
    const match = scoreRecipe(r, new Set(['a', 'b']));

    expect(match.status).toBe('ready');
    expect(match.missing).toEqual([]);
    expect(match.coverage).toBe(1);
  });

  it('lists exactly what is missing', () => {
    const r = recipe('r', [ing('a', 'core'), ing('b'), ing('c')]);
    const match = scoreRecipe(r, new Set(['a']));

    expect(match.status).toBe('almost');
    expect(match.missing.map((m) => m.id)).toEqual(['b', 'c']);
    expect(match.have.map((m) => m.id)).toEqual(['a']);
  });

  it('never counts optional ingredients as missing', () => {
    const r = recipe('r', [ing('a', 'core'), ing('garnish', 'optional')]);
    const match = scoreRecipe(r, new Set(['a']));

    expect(match.status).toBe('ready');
    expect(match.missing).toEqual([]);
    expect(match.optionalMissing.map((m) => m.id)).toEqual(['garnish']);
  });

  it('assumes staples are on hand by default', () => {
    const r = recipe('r', [ing('a', 'core'), ing('salt', 'normal', true)]);
    const match = scoreRecipe(r, new Set(['a']));

    expect(match.status).toBe('ready');
    expect(match.assumedStaples.map((m) => m.id)).toEqual(['salt']);
    expect(match.coverage).toBe(1);
  });

  it('treats staples as required when asked to', () => {
    const r = recipe('r', [ing('a', 'core'), ing('salt', 'normal', true)]);
    const match = scoreRecipe(r, new Set(['a']), { assumeStaples: false });

    expect(match.status).toBe('almost');
    expect(match.missing.map((m) => m.id)).toEqual(['salt']);
  });

  it('weights core ingredients more heavily than normal ones', () => {
    const r = recipe('r', [ing('hero', 'core'), ing('extra')]);

    const missingCore = scoreRecipe(r, new Set(['extra']));
    const missingNormal = scoreRecipe(r, new Set(['hero']));

    expect(missingNormal.coverage).toBeGreaterThan(missingCore.coverage);
  });

  it('sorts missing ingredients with the most important first', () => {
    const r = recipe('r', [ing('zzz-core', 'core'), ing('aaa-normal')]);
    const match = scoreRecipe(r, new Set(['other']));

    expect(match.missing.map((m) => m.id)).toEqual(['zzz-core', 'aaa-normal']);
  });

  it('marks recipes more than three ingredients short as a stretch', () => {
    const r = recipe('r', [ing('a'), ing('b'), ing('c'), ing('d'), ing('e')]);
    expect(scoreRecipe(r, new Set(['a'])).status).toBe('stretch');
  });
});

describe('matchRecipes', () => {
  const cookable = recipe('cookable', [ing('a', 'core'), ing('b')]);
  const oneShort = recipe('one-short', [ing('a', 'core'), ing('b'), ing('c')]);
  const unrelated = recipe('unrelated', [ing('x', 'core'), ing('y')]);

  it('returns nothing for an empty pantry', () => {
    expect(matchRecipes([cookable, oneShort], [])).toEqual([]);
  });

  it('excludes recipes sharing no ingredients with the pantry', () => {
    const results = matchRecipes([cookable, unrelated], ['a', 'b']);
    expect(results.map((m) => m.recipe.id)).toEqual(['cookable']);
  });

  it('ranks ready recipes above ones that are missing something', () => {
    const results = matchRecipes([oneShort, cookable], ['a', 'b']);
    expect(results.map((m) => m.recipe.id)).toEqual(['cookable', 'one-short']);
  });

  it('prefers recipes that use more of the pantry when coverage ties', () => {
    const usesOne = recipe('uses-one', [ing('a', 'core')]);
    const usesThree = recipe('uses-three', [ing('a', 'core'), ing('b'), ing('c')]);

    const results = matchRecipes([usesOne, usesThree], ['a', 'b', 'c']);
    expect(results[0].recipe.id).toBe('uses-three');
  });

  it('filters by tag', () => {
    const veggie = recipe('veggie', [ing('a')], { tags: ['vegetarian'] });
    const meaty = recipe('meaty', [ing('a')], { tags: [] });

    const results = matchRecipes([veggie, meaty], ['a'], { tags: ['vegetarian'] });
    expect(results.map((m) => m.recipe.id)).toEqual(['veggie']);
  });

  it('filters by total time', () => {
    const quick = recipe('quick', [ing('a')], { totalMinutes: 10 });
    const slow = recipe('slow', [ing('a')], { totalMinutes: 120 });

    const results = matchRecipes([quick, slow], ['a'], { maxTotalMinutes: 30 });
    expect(results.map((m) => m.recipe.id)).toEqual(['quick']);
  });

  it('filters by how many ingredients are missing', () => {
    const results = matchRecipes([cookable, oneShort], ['a', 'b'], { maxMissing: 0 });
    expect(results.map((m) => m.recipe.id)).toEqual(['cookable']);
  });

  it('respects the limit', () => {
    expect(matchRecipes([cookable, oneShort], ['a', 'b'], { limit: 1 })).toHaveLength(1);
  });
});

describe('allergen exclusion', () => {
  it('drops a recipe whose required ingredient carries the allergen', () => {
    const r = recipe('nutty', [ing('have'), ing('peanuts', 'core', false, ['peanut'])]);
    expect(matchRecipes([r], ['have'], { excludeAllergens: ['peanut'] })).toEqual([]);
  });

  it('drops a recipe even when the allergen is only an optional garnish', () => {
    // Strict on purpose: a trace of peanut in a garnish still matters.
    const r = recipe('garnished', [ing('have'), ing('peanuts', 'optional', false, ['peanut'])]);
    expect(matchRecipes([r], ['have'], { excludeAllergens: ['peanut'] })).toEqual([]);
  });

  it('keeps recipes carrying a different allergen', () => {
    const r = recipe('fishy', [ing('have'), ing('cod', 'core', false, ['fish'])]);
    expect(matchRecipes([r], ['have'], { excludeAllergens: ['peanut'] })).toHaveLength(1);
  });

  it('excludes on any one of several selected allergens', () => {
    const dairy = recipe('dairy', [ing('have'), ing('milk', 'core', false, ['dairy'])]);
    const gluten = recipe('gluten', [ing('have'), ing('flour', 'core', false, ['gluten'])]);
    const safe = recipe('safe', [ing('have'), ing('rice', 'core')]);

    const results = matchRecipes([dairy, gluten, safe], ['have'], {
      excludeAllergens: ['dairy', 'gluten'],
    });
    expect(results.map((m) => m.recipe.id)).toEqual(['safe']);
  });

  it('ignores ingredients an allergen filter does not cover', () => {
    const r = recipe('plain', [ing('have'), ing('rice', 'core')]);
    expect(matchRecipes([r], ['have'], { excludeAllergens: ['dairy'] })).toHaveLength(1);
  });
});

describe('dislike exclusion', () => {
  it('drops a recipe that requires a disliked ingredient', () => {
    const r = recipe('corianderish', [ing('have'), ing('coriander', 'core')]);
    expect(matchRecipes([r], ['have'], { dislikedIngredientIds: ['coriander'] })).toEqual([]);
  });

  it('keeps a recipe where the disliked ingredient is only a garnish', () => {
    // Lenient by design: you can just leave the coriander off.
    const r = recipe('garnished', [ing('have'), ing('coriander', 'optional')]);
    expect(matchRecipes([r], ['have'], { dislikedIngredientIds: ['coriander'] })).toHaveLength(1);
  });

  it('applies allergies and dislikes together', () => {
    const a = recipe('a', [ing('have'), ing('milk', 'core', false, ['dairy'])]);
    const b = recipe('b', [ing('have'), ing('mushroom', 'core')]);
    const c = recipe('c', [ing('have'), ing('rice')]);

    const results = matchRecipes([a, b, c], ['have'], {
      excludeAllergens: ['dairy'],
      dislikedIngredientIds: ['mushroom'],
    });
    expect(results.map((m) => m.recipe.id)).toEqual(['c']);
  });
});

describe('diet, region and meal filters', () => {
  const dairy = () => ing('milk', 'core', false, ['dairy']);
  const wheat = () => ing('flour', 'core', false, ['gluten']);

  it('stacks diets — every selected diet must hold', () => {
    const veganOnly = recipe('vegan-only', [ing('have'), wheat()], { tags: ['vegan'] });
    const veganGf = recipe('vegan-gf', [ing('have'), ing('rice')], { tags: ['vegan'] });

    const results = matchRecipes([veganOnly, veganGf], ['have'], {
      diets: ['vegan', 'gluten-free'],
    });
    expect(results.map((m) => m.recipe.id)).toEqual(['vegan-gf']);
  });

  it('derives free-from diets from allergen tags', () => {
    const creamy = recipe('creamy', [ing('have'), dairy()]);
    const plain = recipe('plain', [ing('have'), ing('rice')]);

    const results = matchRecipes([creamy, plain], ['have'], { diets: ['dairy-free'] });
    expect(results.map((m) => m.recipe.id)).toEqual(['plain']);
  });

  it('widens on region — several regions means any of them', () => {
    const asian = recipe('asian', [ing('have')], { region: 'asian' });
    const italian = recipe('italian', [ing('have')], { region: 'mediterranean' });
    const british = recipe('british', [ing('have')], { region: 'european' });

    const results = matchRecipes([asian, italian, british], ['have'], {
      regions: ['asian', 'mediterranean'],
    });
    expect(results.map((m) => m.recipe.id).sort()).toEqual(['asian', 'italian']);
  });

  it('matches a recipe belonging to any selected meal', () => {
    const brunch = recipe('pancakes', [ing('have')], { mealTypes: ['breakfast', 'brunch'] });
    const dinner = recipe('stew', [ing('have')], { mealTypes: ['dinner'] });

    expect(
      matchRecipes([brunch, dinner], ['have'], { mealTypes: ['brunch'] }).map((m) => m.recipe.id),
    ).toEqual(['pancakes']);

    // The same recipe still shows under its other meal.
    expect(
      matchRecipes([brunch, dinner], ['have'], { mealTypes: ['breakfast'] }).map((m) => m.recipe.id),
    ).toEqual(['pancakes']);
  });

  it('combines diet, region and meal', () => {
    const target = recipe('target', [ing('have'), ing('rice')], {
      tags: ['vegan'],
      region: 'asian',
      mealTypes: ['dinner'],
    });
    const wrongRegion = recipe('wrong-region', [ing('have'), ing('rice')], {
      tags: ['vegan'],
      region: 'european',
      mealTypes: ['dinner'],
    });

    const results = matchRecipes([target, wrongRegion], ['have'], {
      diets: ['vegan'],
      regions: ['asian'],
      mealTypes: ['dinner'],
    });
    expect(results.map((m) => m.recipe.id)).toEqual(['target']);
  });
});

describe('spice', () => {
  const chilli = () => ing('chilli', 'core', false, [], true);
  const chilliGarnish = () => ing('chilli', 'optional', false, [], true);

  it('reports a recipe with a required spicy ingredient as spicy', () => {
    const heat = recipeHeat(recipe('hot', [ing('have'), chilli()]));
    expect(heat.spicy).toBe(true);
    expect(heat.optionalOnly).toBe(false);
    expect(heat.sources).toEqual(['chilli']);
  });

  it('separates optional heat from unavoidable heat', () => {
    const heat = recipeHeat(recipe('maybe', [ing('have'), chilliGarnish()]));
    expect(heat.spicy).toBe(false);
    expect(heat.optionalOnly).toBe(true);
  });

  it('reports a recipe with no spicy ingredients as mild', () => {
    const heat = recipeHeat(recipe('mild', [ing('have'), ing('rice')]));
    expect(heat.spicy).toBe(false);
    expect(heat.optionalOnly).toBe(false);
    expect(hasHeat(heat)).toBe(false);
  });

  it('badges both unavoidable and optional heat', () => {
    expect(hasHeat(recipeHeat(recipe('a', [chilli()])))).toBe(true);
    expect(hasHeat(recipeHeat(recipe('b', [chilliGarnish()])))).toBe(true);
  });

  it('excludes unavoidably spicy recipes when asked', () => {
    const hot = recipe('hot', [ing('have'), chilli()]);
    expect(matchRecipes([hot], ['have'], { excludeSpicy: true })).toEqual([]);
  });

  it('keeps recipes whose heat is only an optional garnish', () => {
    // You can just leave the chilli out, same leniency as dislikes.
    const maybe = recipe('maybe', [ing('have'), chilliGarnish()]);
    expect(matchRecipes([maybe], ['have'], { excludeSpicy: true })).toHaveLength(1);
  });

  it('leaves spicy recipes alone when the filter is off', () => {
    const hot = recipe('hot', [ing('have'), chilli()]);
    expect(matchRecipes([hot], ['have'])).toHaveLength(1);
  });
});

describe('suggestUnlocks', () => {
  it('counts how many recipes a single purchase would unlock', () => {
    const a = recipe('a', [ing('have'), ing('milk')]);
    const b = recipe('b', [ing('have'), ing('milk')]);
    const c = recipe('c', [ing('have'), ing('flour')]);

    const unlocks = suggestUnlocks(matchRecipes([a, b, c], ['have']));

    expect(unlocks[0].ingredient.id).toBe('milk');
    expect(unlocks[0].unlocks).toBe(2);
    expect(unlocks[0].recipes.sort()).toEqual(['a', 'b']);
  });

  it('ignores recipes needing more than one ingredient', () => {
    const far = recipe('far', [ing('have'), ing('x'), ing('y')]);
    expect(suggestUnlocks(matchRecipes([far], ['have']))).toEqual([]);
  });
});
