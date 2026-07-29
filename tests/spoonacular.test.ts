import { describe, expect, it } from 'vitest';
import { INGREDIENTS } from '@/lib/db/data/ingredients';
import { buildLexicon } from '@/lib/matching/normalize';
import { matchRecipes } from '@/lib/matching/match';
import { dedupeRecipes } from '@/lib/recipes';
import {
  mapSpoonacularRecipe,
  stripHtml,
  toDescription,
  toInstructions,
  type SpoonacularRecipe,
} from '@/lib/recipes/spoonacular/map';
import {
  hasUnmappableAllergen,
  mealTypesFromDishTypes,
  regionFromCuisines,
  toCuisines,
  toIntolerances,
  toMealTypeParams,
} from '@/lib/recipes/spoonacular/taxonomy';
import type { Ingredient, Recipe } from '@/lib/types';

const ingredients: Ingredient[] = INGREDIENTS.map((i) => ({
  id: i.id,
  name: i.name,
  category: i.category,
  isStaple: i.staple ?? false,
  allergens: i.allergens ?? [],
  isSpicy: i.spicy ?? false,
}));

const aliases = new Map<string, string>();
for (const ing of INGREDIENTS) {
  aliases.set(ing.name.toLowerCase(), ing.id);
  for (const alias of ing.aliases ?? []) aliases.set(alias.toLowerCase(), ing.id);
}
const lexicon = buildLexicon(ingredients, aliases);

const baseRecipe = (over: Partial<SpoonacularRecipe> = {}): SpoonacularRecipe => ({
  id: 12345,
  title: 'Tomato and Basil Pasta',
  image: 'https://img.spoonacular.com/recipes/12345-312x231.jpg',
  servings: 4,
  readyInMinutes: 25,
  cuisines: ['Italian'],
  dishTypes: ['main course'],
  extendedIngredients: [
    { name: 'spaghetti', amount: 200, unit: 'g' },
    { name: 'garlic', amount: 2, unit: 'cloves' },
    { name: 'fresh basil', amount: 1, unit: 'handful' },
  ],
  analyzedInstructions: [{ steps: [{ number: 1, step: 'Boil the pasta.' }] }],
  ...over,
});

describe('taxonomy mapping', () => {
  it('maps our allergens onto Spoonacular intolerances', () => {
    expect(toIntolerances(['dairy', 'peanut', 'tree-nut'])).toEqual(['Dairy', 'Peanut', 'Tree Nut']);
  });

  it('maps fish onto the broader Seafood value', () => {
    // Spoonacular has no fish-only intolerance; Seafood over-excludes, which is
    // the safe direction.
    expect(toIntolerances(['fish'])).toEqual(['Seafood']);
  });

  it('silently drops allergens Spoonacular cannot express', () => {
    expect(toIntolerances(['mustard', 'celery'])).toEqual([]);
  });

  it('flags when an unmappable allergen is selected', () => {
    // This is what stops external recipes being shown at all.
    expect(hasUnmappableAllergen(['mustard'])).toBe(true);
    expect(hasUnmappableAllergen(['celery', 'dairy'])).toBe(true);
    expect(hasUnmappableAllergen(['dairy', 'peanut'])).toBe(false);
    expect(hasUnmappableAllergen([])).toBe(false);
    expect(hasUnmappableAllergen(undefined)).toBe(false);
  });

  it('groups Spoonacular cuisines into our regions', () => {
    expect(regionFromCuisines(['Italian'])).toBe('mediterranean');
    expect(regionFromCuisines(['Thai'])).toBe('asian');
    expect(regionFromCuisines(['Cajun'])).toBe('american');
    expect(regionFromCuisines(['Nordic'])).toBe('european');
    expect(regionFromCuisines([])).toBe('other');
    expect(regionFromCuisines(['Martian'])).toBe('other');
  });

  it('expands our regions into Spoonacular cuisines', () => {
    expect(toCuisines(['mediterranean'])).toContain('Italian');
    expect(toCuisines(['asian'])).toContain('Thai');
    expect(toCuisines([])).toEqual([]);
  });

  it('maps lunch and dinner onto the same Spoonacular type', () => {
    // Spoonacular draws no lunch/dinner distinction.
    expect(toMealTypeParams(['lunch'])).toEqual(['main course']);
    expect(toMealTypeParams(['dinner'])).toEqual(['main course']);
    expect(toMealTypeParams(['lunch', 'dinner'])).toEqual(['main course']);
  });

  it('reads meals back off dish types, giving main course both meals', () => {
    expect(mealTypesFromDishTypes(['main course']).sort()).toEqual(['dinner', 'lunch']);
    expect(mealTypesFromDishTypes(['breakfast'])).toContain('brunch');
  });

  it('defaults an unlabelled dish to dinner rather than nothing', () => {
    // With no meal types the recipe would vanish under any meal filter.
    expect(mealTypesFromDishTypes([])).toEqual(['dinner']);
    expect(mealTypesFromDishTypes(['nonsense'])).toEqual(['dinner']);
  });
});

describe('html handling', () => {
  it('strips tags and decodes entities from summaries', () => {
    expect(stripHtml('<b>Tasty</b> &amp; quick <a href="#">recipe</a>')).toBe('Tasty & quick recipe');
  });

  it('trims a long summary to a couple of sentences', () => {
    const summary = '<p>' + 'One sentence. '.repeat(20) + '</p>';
    expect(toDescription(baseRecipe({ summary })).length).toBeLessThanOrEqual(240);
  });

  it('falls back to plain instructions when none are analysed', () => {
    const steps = toInstructions(
      baseRecipe({ analyzedInstructions: [], instructions: 'Boil water. Add pasta. Drain well.' }),
    );
    expect(steps.length).toBeGreaterThan(1);
    expect(steps[0]).toBe('Boil water.');
  });
});

describe('mapSpoonacularRecipe', () => {
  it('resolves ingredients onto the canonical catalogue', () => {
    const recipe = mapSpoonacularRecipe(baseRecipe(), lexicon)!;
    const ids = recipe.ingredients.map((i) => i.id);

    // "spaghetti" and "fresh basil" are aliases in our catalogue.
    expect(ids).toContain('pasta');
    expect(ids).toContain('garlic');
    expect(ids).toContain('basil');
  });

  it('keeps unrecognised ingredients as ext: entries rather than dropping them', () => {
    const recipe = mapSpoonacularRecipe(
      baseRecipe({ extendedIngredients: [{ name: 'tamarind paste', amount: 1, unit: 'tbsp' }] }),
      lexicon,
    )!;

    // Dropping would make the recipe look easier to cook than it is.
    expect(recipe.ingredients).toHaveLength(1);
    expect(recipe.ingredients[0].id).toBe('ext:tamarind-paste');
    expect(recipe.ingredients[0].name).toBe('Tamarind paste');
  });

  it('never matches an ext: ingredient against the pantry', () => {
    const recipe = mapSpoonacularRecipe(
      baseRecipe({
        extendedIngredients: [
          { name: 'spaghetti', amount: 200, unit: 'g' },
          { name: 'tamarind paste', amount: 1, unit: 'tbsp' },
        ],
      }),
      lexicon,
    )!;

    const [match] = matchRecipes([recipe], ['pasta'], {});
    expect(match.have.map((i) => i.id)).toEqual(['pasta']);
    expect(match.missing.map((i) => i.id)).toContain('ext:tamarind-paste');
  });

  it('collapses duplicate ingredients that resolve to the same id', () => {
    const recipe = mapSpoonacularRecipe(
      baseRecipe({
        extendedIngredients: [
          { name: 'garlic', amount: 2, unit: 'cloves' },
          { name: 'garlic cloves', amount: 1, unit: 'clove' },
        ],
      }),
      lexicon,
    )!;

    // Left unmerged these would double-count in the coverage score.
    expect(recipe.ingredients.filter((i) => i.id === 'garlic')).toHaveLength(1);
  });

  it('carries source metadata and marks allergens unverified', () => {
    const recipe = mapSpoonacularRecipe(baseRecipe(), lexicon)!;
    expect(recipe.sourceId).toBe('spoonacular');
    expect(recipe.slug).toBe('spoonacular-12345');
    expect(recipe.imageUrl).toContain('img.spoonacular.com');
    expect(recipe.allergensUnverified).toBe(true);
  });

  it('puts vegetarian and vegan into tags so the diet filter sees them', () => {
    const recipe = mapSpoonacularRecipe(baseRecipe({ vegetarian: true, vegan: true }), lexicon)!;
    expect(recipe.tags).toContain('vegetarian');
    expect(recipe.diets).toContain('vegan');
  });

  it('rejects payloads with nothing usable', () => {
    expect(mapSpoonacularRecipe({ id: 0, title: '' }, lexicon)).toBeNull();
    expect(mapSpoonacularRecipe(baseRecipe({ extendedIngredients: [] }), lexicon)).toBeNull();
  });

  it('produces recipes the existing filters accept unchanged', () => {
    const recipe = mapSpoonacularRecipe(baseRecipe(), lexicon)!;

    expect(matchRecipes([recipe], ['pasta'], { regions: ['mediterranean'] })).toHaveLength(1);
    expect(matchRecipes([recipe], ['pasta'], { regions: ['asian'] })).toHaveLength(0);
    expect(matchRecipes([recipe], ['pasta'], { mealTypes: ['dinner'] })).toHaveLength(1);
    expect(matchRecipes([recipe], ['pasta'], { maxTotalMinutes: 10 })).toHaveLength(0);
  });
});

describe('dedupeRecipes', () => {
  const make = (over: Partial<Recipe>): Recipe =>
    ({
      id: 'x',
      slug: 'x',
      title: 'Thing',
      description: '',
      cuisine: 'test',
      region: 'other',
      mealTypes: ['dinner'],
      diets: [],
      servings: 2,
      prepMinutes: 1,
      cookMinutes: 1,
      totalMinutes: 2,
      difficulty: 'easy',
      emoji: '🍽️',
      tags: [],
      instructions: [],
      ingredients: [],
      ...over,
    }) as Recipe;

  it('prefers the local copy of a duplicate title', () => {
    const external = make({ id: 'spoonacular-1', slug: 'spoonacular-1', sourceId: 'spoonacular' });
    const local = make({ id: 'r-1', slug: 'thing', sourceId: 'local' });

    // Local wins because its importance weights make it score better.
    expect(dedupeRecipes([external, local]).map((r) => r.id)).toEqual(['r-1']);
    expect(dedupeRecipes([local, external]).map((r) => r.id)).toEqual(['r-1']);
  });

  it('keeps genuinely different recipes', () => {
    const a = make({ id: 'a', slug: 'a', title: 'Dal' });
    const b = make({ id: 'b', slug: 'b', title: 'Shakshuka' });
    expect(dedupeRecipes([a, b])).toHaveLength(2);
  });

  it('drops repeats of the same id', () => {
    const a = make({ id: 'a', slug: 'a' });
    expect(dedupeRecipes([a, a])).toHaveLength(1);
  });

  it('ignores punctuation and case when comparing titles', () => {
    const a = make({ id: 'a', slug: 'a', title: 'Spaghetti Aglio e Olio', sourceId: 'local' });
    const b = make({ id: 'b', slug: 'b', title: 'spaghetti aglio-e-olio!', sourceId: 'spoonacular' });
    expect(dedupeRecipes([a, b])).toHaveLength(1);
  });
});

// ------------------------------------------------------ British English

import { anglicise } from '@/lib/recipes/spoonacular/map';

describe('anglicise', () => {
  it('translates American food words to the app’s vocabulary', () => {
    expect(anglicise('eggplant')).toBe('aubergine');
    expect(anglicise('cilantro')).toBe('coriander');
    expect(anglicise('zucchini')).toBe('courgette');
    expect(anglicise('garbanzo beans')).toBe('chickpeas');
    expect(anglicise('shrimp')).toBe('prawns');
  });

  it('preserves capitalisation', () => {
    // Otherwise a title would read "Roasted aubergine Hummus".
    expect(anglicise('Roasted Eggplant Hummus')).toBe('Roasted Aubergine Hummus');
    expect(anglicise('EGGPLANT')).toBe('AUBERGINE');
  });

  it('handles plurals', () => {
    expect(anglicise('two eggplants')).toBe('two aubergines');
  });

  it('only matches whole words', () => {
    expect(anglicise('chiliad')).toBe('chiliad');
  });

  it('leaves text with nothing to translate alone', () => {
    expect(anglicise('Spaghetti Aglio e Olio')).toBe('Spaghetti Aglio e Olio');
  });

  it('is applied to mapped recipe titles', () => {
    const recipe = mapSpoonacularRecipe(
      baseRecipe({ title: 'Roasted Eggplant and Cilantro Salad' }),
      lexicon,
    )!;
    expect(recipe.title).toBe('Roasted Aubergine and Coriander Salad');
  });
});
