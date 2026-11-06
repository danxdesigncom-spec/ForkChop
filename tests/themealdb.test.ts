import { describe, expect, it } from 'vitest';
import raw from './fixtures/themealdb/meals.json';
import {
  buildReport,
  dietTags,
  findSeedDuplicate,
  importCatalog,
  importanceForMeasure,
  mapIngredientName,
  mealTypesForCategory,
  normaliseTitle,
  parseMeasure,
  redactKey,
  splitInstructions,
  toSeedIngredientRows,
  transformMeal,
  vocabularyTags,
  zipIngredients,
  type TheMealDbMeal,
  type TheMealDbRaw,
} from '@/lib/catalog/themealdb';
import { seedAliasMap, seedIngredients, seedLexicon } from '@/lib/catalog/lexicon';
import { RECIPES } from '@/lib/db/data/recipes';
import { anglicise } from '@/lib/recipes/spoonacular/map';

/**
 * TheMealDB import, offline. Fixtures are in TheMealDB's response shape (see
 * the note in meals.json) and cover fractions, ranges, blank slots, "to
 * taste", US spellings, a seed duplicate, an unmappable ingredient, an
 * ambiguous one, numbered instructions and a diet contradiction.
 */

const RAW = raw as unknown as TheMealDbRaw;
const lexicon = seedLexicon();
const seeds = RECIPES.map((r) => ({ slug: r.slug, title: r.title, ingredientIds: r.ingredients.map((i) => i.id) }));
const meal = (id: string) => RAW.meals.find((m) => m.idMeal === id) as TheMealDbMeal;
const transform = (id: string) => transformMeal(meal(id), { lexicon, importedAt: RAW.fetched_at });

describe('zipIngredients', () => {
  it('pairs ingredients with measures and drops blank, whitespace and null slots', () => {
    const lines = zipIngredients(meal('99001'));
    expect(lines.map((l) => l.name)).toEqual([
      'Chicken Breast', 'Soy Sauce', 'Garlic', 'Rice', 'Onion', 'Spring Onions', 'Salt',
    ]);
    // Slot 8 has a measure but a whitespace-only ingredient: dropped, not kept as "".
    expect(lines.every((l) => l.position <= 7)).toBe(true);
    expect(lines[1]).toEqual({ position: 2, name: 'Soy Sauce', measure: '3 tbs' });
  });

  it('keeps an ingredient with no measure', () => {
    const lines = zipIngredients({ idMeal: '1', strMeal: 'x', strIngredient1: 'Salt', strMeasure1: null });
    expect(lines).toEqual([{ position: 1, name: 'Salt', measure: '' }]);
  });
});

describe('parseMeasure', () => {
  it.each([
    ['1/2 tsp', 0.5, null, 'tsp', null],
    ['1 ½ cups', 1.5, null, 'cup', null],
    ['1½', 1.5, null, null, null],
    ['¼ cup', 0.25, null, 'cup', null],
    ['2-3', 2, 3, null, null],
    ['2 – 3 tbs', 2, 3, 'tbsp', null],
    ['400g', 400, null, 'g', null],
    ['1.5kg', 1.5, null, 'kg', null],
    ['1 tin', 1, null, 'tin', null],
    ['1 tin of chopped tomatoes', 1, null, 'tin', 'chopped tomatoes'],
    ['2 cloves chopped', 2, null, 'clove', 'chopped'],
    ['3 Tablespoons', 3, null, 'tbsp', null],
    ['1 large', 1, null, null, 'large'],
    ['Pinch', 1, null, 'pinch', null],
    ['a pinch', 1, null, 'pinch', null],
  ] as const)('%s', (input, quantity, quantityMax, unit, note) => {
    expect(parseMeasure(input)).toEqual({ display: input, quantity, quantityMax, unit, note });
  });

  it.each(['to taste', 'Dusting', 'sliced', 'Juice of 1'])('keeps "%s" as a note, with no invented amount', (input) => {
    expect(parseMeasure(input)).toEqual({ display: input, quantity: null, quantityMax: null, unit: null, note: input });
  });

  it('keeps the multiplier as the count and the pack size in the note', () => {
    expect(parseMeasure('2 x 400g tins')).toMatchObject({ quantity: 2, unit: null, note: '400 g tins' });
  });

  it('never loses the original wording', () => {
    expect(parseMeasure('  1   ½  tbs ').display).toBe('1 ½ tbs');
    expect(parseMeasure(null).display).toBe('');
  });

  it('does not mistake a word starting with a unit letter for a unit', () => {
    expect(parseMeasure('large').unit).toBeNull();
    expect(parseMeasure('can be omitted').unit).toBeNull();
  });
});

describe('importanceForMeasure', () => {
  it('treats garnishes and serving suggestions as optional', () => {
    expect(importanceForMeasure('To serve')).toBe('optional');
    expect(importanceForMeasure('Dusting')).toBe('optional');
    expect(importanceForMeasure('for greasing')).toBe('optional');
    expect(importanceForMeasure('to taste')).toBe('normal');
    expect(importanceForMeasure('200g')).toBe('normal');
  });
});

describe('British English pass', () => {
  it('anglicises US ingredient names before mapping', () => {
    const recipe = transform('99002');
    expect(recipe.title).toBe('Aubergine and Courgette Bake');
    expect(recipe.ingredients.map((l) => l.name)).toEqual([
      'Aubergine', 'Courgette', 'Coriander', 'Chopped Tomatoes', 'Mozzarella', 'Olive Oil',
    ]);
    expect(recipe.ingredients.map((l) => l.sourceName).slice(0, 3)).toEqual(['Eggplant', 'Zucchini', 'Cilantro']);
    expect(recipe.ingredients.map((l) => l.ingredientId).slice(0, 3)).toEqual(['aubergine', 'courgette', 'coriander']);
  });

  it('leaves instructions untouched apart from trimming', () => {
    // "Slice the eggplant" stays American in the method: the brief is explicit.
    expect(transform('99002').instructions[1]).toBe('Slice the eggplant and zucchini.');
    expect(anglicise('Slice the eggplant')).toBe('Slice the aubergine'); // the function would change it
  });
});

describe('splitInstructions', () => {
  it('drops "STEP n" headings and blank lines', () => {
    expect(transform('99001').instructions).toEqual([
      'Mix the soy sauce and garlic, then coat the chicken.',
      'Fry the chicken and onion until golden.',
      'Serve over the rice with spring onions.',
    ]);
  });

  it('strips inline "1." numbering', () => {
    expect(transform('99002').instructions).toEqual([
      'Heat the oven to 200C.',
      'Slice the eggplant and zucchini.',
      'Layer with the tomatoes and mozzarella, then bake for 40 minutes.',
    ]);
  });

  it('handles \\r\\n, lone \\n, "Step 2:" and empties', () => {
    expect(splitInstructions('Step 1: Boil.\n\nStep 2: Eat.\r\n \r\n')).toEqual(['Boil.', 'Eat.']);
    expect(splitInstructions(null)).toEqual([]);
  });

  it('keeps a single-paragraph method as one step', () => {
    expect(transform('99008').instructions).toHaveLength(1);
  });
});

describe('mapIngredientName', () => {
  it('maps exact, plural and stripped names', () => {
    expect(mapIngredientName('Plain Flour', lexicon)).toMatchObject({ outcome: 'mapped', ingredientId: 'flour' });
    expect(mapIngredientName('Spring Onions', lexicon)).toMatchObject({ outcome: 'mapped', ingredientId: 'spring-onion' });
    expect(mapIngredientName('Chicken Stock', lexicon)).toMatchObject({ outcome: 'mapped', ingredientId: 'stock' });
  });

  it('maps a partial match when exactly one entry fits best', () => {
    expect(mapIngredientName('Egg Yolks', lexicon)).toMatchObject({ outcome: 'mapped', ingredientId: 'egg', method: 'partial' });
  });

  it('calls a tied partial match ambiguous, listing the candidates', () => {
    expect(mapIngredientName('Peanut Oil', lexicon)).toEqual({
      outcome: 'ambiguous',
      ingredientId: null,
      method: 'partial',
      candidates: ['nuts', 'vegetable-oil'],
    });
  });

  it('calls a typo match ambiguous rather than guessing', () => {
    expect(mapIngredientName('Tomatoe', lexicon)).toMatchObject({ outcome: 'ambiguous', method: 'fuzzy', candidates: ['tomato'] });
  });

  it('reports unknown ingredients as unmapped', () => {
    expect(mapIngredientName('Shallots', lexicon)).toMatchObject({ outcome: 'unmapped', ingredientId: null });
  });

  it('applies overrides first: an id maps, null records a decision to leave it unmapped', () => {
    expect(mapIngredientName('Peanut Oil', lexicon, { 'peanut oil': 'nuts' })).toMatchObject({
      outcome: 'mapped', ingredientId: 'nuts', method: 'override',
    });
    expect(mapIngredientName('Shallots', lexicon, { shallots: null })).toMatchObject({ outcome: 'unmapped', method: 'override' });
    // An override pointing at an id that doesn't exist must not invent one.
    expect(mapIngredientName('Shallots', lexicon, { shallots: 'shallot' })).toMatchObject({ outcome: 'unmapped' });
  });
});

describe('transformMeal', () => {
  it('builds a ready recipe with provenance, and no invented times or servings', () => {
    const r = transform('99001');
    expect(r).toMatchObject({
      id: 'themealdb-99001',
      slug: 'garlic-soy-chicken-with-rice-themealdb-99001',
      source: 'themealdb',
      sourceId: '99001',
      licence: 'themealdb-api',
      attribution: 'Recipe from TheMealDB',
      attributionUrl: 'https://www.themealdb.com/meal/99001',
      // No strSource, so source_url falls back to the TheMealDB page.
      sourceUrl: 'https://www.themealdb.com/meal/99001',
      imageUrl: 'https://www.themealdb.com/images/media/meals/fixture99001.jpg',
      imageLicence: 'themealdb',
      videoUrl: 'https://www.youtube.com/watch?v=fixture99001',
      importedAt: '2026-11-06T00:00:00.000Z',
      servings: null,
      prepMinutes: null,
      cookMinutes: null,
      difficulty: null,
      cuisine: 'Chinese',
      mealTypes: ['dinner'],
      status: 'ready',
      reviewReasons: [],
    });
    // "Speedy" maps into the existing vocabulary; "Meat" and "Dinner" don't, and stay in sourceTags.
    expect(r.tags).toEqual(['quick']);
    expect(r.sourceTags).toEqual(['Speedy', 'Meat', 'Dinner']);
  });

  it('uses strSource for source_url when present', () => {
    expect(transform('99002').sourceUrl).toBe('https://example.com/eggplant-zucchini-bake');
    expect(transform('99002').attributionUrl).toBe('https://www.themealdb.com/meal/99002');
  });

  it('holds back a recipe with an unmapped required ingredient', () => {
    const r = transform('99004');
    expect(r.status).toBe('needs_review');
    expect(r.reviewReasons).toEqual(['unmapped: Shallots']);
    // Nothing is dropped: the unmapped line is still in the record.
    expect(r.ingredients.find((l) => l.sourceName === 'Shallots')).toMatchObject({ outcome: 'unmapped', display: '8' });
  });

  it('holds back a recipe with an ambiguous required ingredient', () => {
    expect(transform('99005').reviewReasons).toEqual(['ambiguous: Peanut Oil (nuts | vegetable-oil)']);
  });

  it('does not let an optional garnish block a recipe', () => {
    const r = transformMeal(
      { idMeal: '1', strMeal: 'Toast', strInstructions: 'Toast it.', strIngredient1: 'Bread', strMeasure1: '1 slice', strIngredient2: 'Shallots', strMeasure2: 'to garnish' },
      { lexicon, importedAt: 'x' },
    );
    expect(r.status).toBe('ready');
  });

  it('maps "Unknown" area to no cuisine and an empty tag string to no tags', () => {
    const r = transform('99007');
    expect(r.cuisine).toBe('');
    expect(r.sourceTags).toEqual([]);
    expect(r.mealTypes).toEqual(['dessert']);
    expect(r.videoUrl).toBeNull(); // strYoutube was ""
  });

  it('copes with a missing photo', () => {
    expect(transform('99008')).toMatchObject({ imageUrl: null, imageLicence: null });
  });
});

describe('diet tags', () => {
  const ing = (id: string) => lexicon.byId.get(id)!;

  it('trusts the category only when the ingredients agree', () => {
    expect(transform('99008').tags).toEqual(['vegetarian']);
    expect(dietTags('Vegan', [ing('chickpeas'), ing('rice')]).tags).toEqual(['vegan', 'vegetarian']);
  });

  it('refuses a vegetarian tag on a dish with fish sauce, and sends it to review', () => {
    const r = transform('99006');
    expect(r.tags).toEqual([]);
    expect(r.status).toBe('needs_review');
    expect(r.reviewReasons).toEqual(['category is Vegetarian but contains Fish sauce']);
  });

  it('downgrades "Vegan" to vegetarian when there is egg or dairy', () => {
    expect(dietTags('Vegan', [ing('egg')])).toEqual({ tags: ['vegetarian'], conflicts: ['category is Vegan but contains Egg'] });
  });

  it('ignores diet words in free-form source tags', () => {
    expect(vocabularyTags(['Vegetarian', 'Vegan', 'Cake', 'Cheap'])).toEqual(['baking', 'budget']);
  });
});

describe('mealTypesForCategory', () => {
  it('maps courses, and treats main-ingredient categories as dinner', () => {
    expect(mealTypesForCategory('Breakfast')).toEqual(['breakfast', 'brunch']);
    expect(mealTypesForCategory('Side')).toEqual(['side']);
    expect(mealTypesForCategory('Seafood')).toEqual(['dinner']);
    expect(mealTypesForCategory(null)).toEqual(['dinner']);
  });
});

describe('toSeedIngredientRows', () => {
  it('merges two lines that land on the same id, keeping both measures', () => {
    const rows = toSeedIngredientRows(transform('99007'));
    const butter = rows.filter((r) => r.id === 'butter');
    expect(butter).toHaveLength(1);
    // "for greasing" is optional, "1 knob" is normal; the stronger one wins.
    expect(butter[0]).toMatchObject({ importance: 'normal', display: 'for greasing; 1 knob' });
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });

  it('only emits mapped lines', () => {
    expect(toSeedIngredientRows(transform('99004')).map((r) => r.id)).not.toContain(null);
  });
});

describe('dedupe against the seed catalog', () => {
  it('normalises titles', () => {
    expect(normaliseTitle('Spaghetti  Aglio e Olio!')).toBe(normaliseTitle('spaghetti aglio e olio'));
    expect(normaliseTitle('Fish & Chips')).toBe(normaliseTitle('Fish and Chips'));
    expect(normaliseTitle('Crème Brûlée')).toBe('creme brulee');
  });

  it('skips a recipe whose title matches a seed recipe, keeping the seed', () => {
    expect(findSeedDuplicate(transform('99003'), seeds, lexicon)).toEqual({
      sourceId: '99003', title: 'Spaghetti Aglio e Olio', seedSlug: 'spaghetti-aglio-e-olio', reason: 'title',
    });
  });

  it('skips a differently-named recipe with exactly the same ingredients', () => {
    const base = transform('99001');
    const line = base.ingredients[0];
    const withIds = (ids: string[]) => ({
      ...base,
      title: 'Something Else Entirely',
      ingredients: ids.map((id, i) => ({ ...line, position: i + 1, ingredientId: id, importance: 'normal' as const })),
    });
    const seed = { slug: 'seed-stir-fry', title: 'Seed Stir Fry', ingredientIds: ['chicken-breast', 'soy-sauce', 'garlic', 'rice', 'salt'] };

    // Staples don't count towards the signature, so salt vs no salt is still the same dish.
    expect(findSeedDuplicate(withIds(['rice', 'garlic', 'soy-sauce', 'chicken-breast']), [seed], lexicon)).toMatchObject({
      reason: 'ingredients', seedSlug: 'seed-stir-fry',
    });
    // One ingredient different: not a duplicate.
    expect(findSeedDuplicate(withIds(['rice', 'garlic', 'soy-sauce', 'tofu']), [seed], lexicon)).toBeNull();
    // Fewer than three defining ingredients is too little to call it the same dish.
    expect(
      findSeedDuplicate(withIds(['egg', 'butter']), [{ slug: 's', title: 'S', ingredientIds: ['egg', 'butter'] }], lexicon),
    ).toBeNull();
  });

  it('does not call unrelated recipes duplicates', () => {
    expect(findSeedDuplicate(transform('99001'), seeds, lexicon)).toBeNull();
  });
});

describe('importCatalog', () => {
  const run = () => importCatalog(RAW, { lexicon, seeds });

  it('counts, dedupes and orders by id', () => {
    const result = run();
    expect(result.fetched).toBe(8);
    expect(result.duplicates.map((d) => d.sourceId)).toEqual(['99003']);
    expect(result.catalog.recipes.map((r) => r.sourceId)).toEqual(['99001', '99002', '99004', '99005', '99006', '99007', '99008']);
    expect(result.catalog.recipes.filter((r) => r.status === 'ready').map((r) => r.sourceId)).toEqual([
      '99001', '99002', '99007', '99008',
    ]);
    expect(result.catalog).toMatchObject({ source: 'themealdb', apiVersion: 'v2', fetchedAt: '2026-11-06T00:00:00.000Z' });
  });

  it('is idempotent: the same input gives byte-identical output and report', () => {
    const a = run();
    const b = run();
    expect(JSON.stringify(b.catalog)).toBe(JSON.stringify(a.catalog));
    expect(buildReport(b, lexicon)).toBe(buildReport(a, lexicon));
  });

  it('is independent of the order meals arrive in', () => {
    const shuffled = { ...RAW, meals: [...RAW.meals].reverse() };
    expect(JSON.stringify(importCatalog(shuffled, { lexicon, seeds }).catalog)).toBe(JSON.stringify(run().catalog));
  });

  it('ignores a meal listed twice', () => {
    const doubled = { ...RAW, meals: [...RAW.meals, RAW.meals[0]] };
    expect(importCatalog(doubled, { lexicon, seeds }).catalog.recipes).toHaveLength(7);
  });
});

describe('buildReport', () => {
  const report = buildReport(importCatalog(RAW, { lexicon, seeds }), lexicon);

  it('states totals and the ready rate', () => {
    expect(report).toContain('| Meals fetched | 8 |');
    expect(report).toContain('| Duplicates of seed recipes (skipped, seed kept) | 1 |');
    expect(report).toContain('**57.1 %**');
  });

  it('ranks unmapped ingredients with what each would unlock', () => {
    expect(report).toMatch(/\| 1 \| Shallots \| 1 \| 1 \| 1 \|/);
  });

  it('lists ambiguous candidates, diet conflicts and duplicates', () => {
    expect(report).toContain('| Peanut Oil | 1 | 1 | Nuts (`nuts`), Vegetable oil (`vegetable-oil`) |');
    expect(report).toContain('Veggie Pad Thai (99006): category is Vegetarian but contains Fish sauce');
    expect(report).toContain('Spaghetti Aglio e Olio (99003) duplicates `spaghetti-aglio-e-olio` by title');
  });
});

describe('redactKey', () => {
  it('hides the key wherever it appears, and any key-shaped API path segment', () => {
    expect(redactKey('https://www.themealdb.com/api/json/v2/abc123/search.php?f=a', 'abc123')).toBe(
      'https://www.themealdb.com/api/json/v2/***/search.php?f=a',
    );
    expect(redactKey('failed: abc123', 'abc123')).toBe('failed: ***');
    // Even without being told the key.
    expect(redactKey('GET https://www.themealdb.com/api/json/v1/zzz/latest.php')).toBe(
      'GET https://www.themealdb.com/api/json/v1/***/latest.php',
    );
  });
});

describe('seedLexicon', () => {
  it('builds from the same data, with the same rules, as the seeder', () => {
    const ids = seedIngredients().map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Every ingredient's own name is a lookup key, as seed.ts inserts it.
    for (const ing of seedIngredients()) expect(seedAliasMap().get(ing.name.toLowerCase())).toBe(ing.id);
  });
});
