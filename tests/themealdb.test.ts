import { describe, expect, it } from 'vitest';
import raw from './fixtures/themealdb/meals.json';
import {
  buildReport,
  cuisineForArea,
  dietTags,
  findSeedDuplicate,
  importCatalog,
  importanceForMeasure,
  mapIngredientName,
  mealTypesForCategory,
  normaliseTitle,
  parseMeasure,
  plainSingular,
  redactKey,
  splitInstructions,
  toSeedIngredientRows,
  transformMeal,
  vocabularyTags,
  zipIngredients,
  type TheMealDbMeal,
  type TheMealDbRaw,
} from '@/lib/catalog/themealdb';
import { impliedAllergens, nameSaysAnimalProduct, nameSaysMeatOrFish } from '@/lib/catalog/mapping-rules';
import { seedAliasMap, seedIngredients, seedLexicon } from '@/lib/catalog/lexicon';
import { THEMEALDB_OVERRIDES } from '@/lib/catalog/themealdb-overrides';
import { RECIPES } from '@/lib/db/data/recipes';

/**
 * TheMealDB import, offline, against real meals copied from raw.json (see the
 * note in fixtures/themealdb/meals.json for what each one covers).
 */

const RAW = raw as unknown as TheMealDbRaw;
const lexicon = seedLexicon();
const overrides = THEMEALDB_OVERRIDES;
const seeds = RECIPES.map((r) => ({ slug: r.slug, title: r.title, ingredientIds: r.ingredients.map((i) => i.id) }));
const meal = (id: string) => RAW.meals.find((m) => m.idMeal === id) as TheMealDbMeal;
const transform = (id: string) => transformMeal(meal(id), { lexicon, overrides, importedAt: RAW.fetched_at });
const map = (name: string) => mapIngredientName(name, lexicon, overrides);
const line = (id: string, source: string) => transform(id).ingredients.find((l) => l.sourceName === source)!;

describe('zipIngredients', () => {
  it('pairs ingredients with measures and drops blank slots', () => {
    const lines = zipIngredients(meal('53393'));
    expect(lines).toEqual([
      { position: 1, name: 'Flour', measure: '500g' },
      { position: 2, name: 'Milk', measure: '500ml' },
      { position: 3, name: 'Instant Yeast', measure: '10g' },
      { position: 4, name: 'Salt', measure: '10g' },
      { position: 5, name: 'Sugar', measure: '25g' },
    ]);
    // The real meal pads slots 6–20 with "" / null; none survive.
    expect(Object.keys(meal('53393')).filter((k) => k.startsWith('strIngredient')).length).toBe(20);
  });

  it('keeps an ingredient with no measure', () => {
    expect(zipIngredients({ idMeal: '1', strMeal: 'x', strIngredient1: 'Salt', strMeasure1: null })).toEqual([
      { position: 1, name: 'Salt', measure: '' },
    ]);
  });
});

describe('parseMeasure', () => {
  it.each([
    ['1/2 teaspoon', 0.5, null, 'tsp', null],
    ['½ tsp', 0.5, null, 'tsp', null],
    ['1 1/2 tsp', 1.5, null, 'tsp', null],
    ['1 ½ cups', 1.5, null, 'cup', null],
    ['1/3 cup', 0.333, null, 'cup', null],
    ['2-3 tbsp', 2, 3, 'tbsp', null],
    ['2 – 3 tbs', 2, 3, 'tbsp', null],
    ['400g', 400, null, 'g', null],
    ['1.5kg', 1.5, null, 'kg', null],
    ['175g/6oz', 175, null, 'g', '/ 6 oz'],
    ['1 tin', 1, null, 'tin', null],
    ['1 (400g) tin', 1, null, null, '(400 g) tin'],
    ['2 cloves chopped', 2, null, 'clove', 'chopped'],
    ['3 tablespoons', 3, null, 'tbsp', null],
    ['3 Medium', 3, null, null, 'Medium'],
    ['pinch', 1, null, 'pinch', null],
    ['a pinch', 1, null, 'pinch', null],
  ] as const)('%s', (input, quantity, quantityMax, unit, note) => {
    expect(parseMeasure(input)).toEqual({ display: input, quantity, quantityMax, unit, note });
  });

  it.each(['to taste', 'To taste', 'Topping', 'Minced', 'Grated', 'Garnish'])('keeps "%s" as a note, with no invented amount', (input) => {
    expect(parseMeasure(input)).toEqual({ display: input, quantity: null, quantityMax: null, unit: null, note: input });
  });

  it('keeps the multiplier as the count and the pack size in the note', () => {
    expect(parseMeasure('2 x 400g tins')).toMatchObject({ quantity: 2, unit: null, note: '400 g tins' });
  });

  it('never loses the original wording, and parses real lines from the fixtures', () => {
    expect(parseMeasure('  1   ½  tbs ').display).toBe('1 ½ tbs');
    expect(line('52767', 'cold water')).toMatchObject({ display: '2-3 tbsp', quantity: 2, quantityMax: 3, unit: 'tbsp' });
    expect(line('52764', 'Minced garlic')).toMatchObject({ display: '1/2 teaspoon', quantity: 0.5, unit: 'tsp' });
  });

  it('does not mistake a word starting with a unit letter for a unit', () => {
    expect(parseMeasure('large').unit).toBeNull();
    expect(parseMeasure('can be omitted').unit).toBeNull();
  });
});

describe('importanceForMeasure', () => {
  it('treats garnishes and serving suggestions as optional', () => {
    expect(importanceForMeasure('Garnish')).toBe('optional');
    expect(importanceForMeasure('To serve')).toBe('optional');
    expect(importanceForMeasure('for greasing')).toBe('optional');
    expect(importanceForMeasure('To taste')).toBe('normal');
    expect(importanceForMeasure('200g')).toBe('normal');
    expect(line('52965', 'Parsley').importance).toBe('optional');
  });
});

describe('British English pass', () => {
  it('anglicises US ingredient names before mapping', () => {
    expect(line('52947', 'Scallions')).toMatchObject({ name: 'Spring onions', ingredientId: 'spring-onion' });
    expect(map('Zucchini')).toMatchObject({ outcome: 'mapped', ingredientId: 'courgette' });
    expect(map('Cilantro')).toMatchObject({ outcome: 'mapped', ingredientId: 'coriander' });
    expect(map('Cornstarch')).toMatchObject({ outcome: 'mapped', ingredientId: 'cornflour' });
  });

  it('leaves instruction text alone apart from trimming', () => {
    const r = transform('52955');
    expect(r.instructions[0]).toBe('In a wok add chicken broth and wait for it to boil.');
  });
});

describe('splitInstructions', () => {
  it('drops "STEP n" headings', () => {
    const steps = transform('52956').instructions;
    expect(steps.some((s) => /^step\s*\d/i.test(s))).toBe(false);
    expect(steps[0]).toBe('MARINATING THE CHICKEN');
  });

  it('strips inline "1." numbering', () => {
    expect(transform('52967').instructions.some((s) => /^\d+\.\s/.test(s))).toBe(false);
  });

  it('handles \\r\\n, lone \\n, "Step 2:" and empties', () => {
    expect(splitInstructions('Step 1: Boil.\n\nStep 2: Eat.\r\n \r\n')).toEqual(['Boil.', 'Eat.']);
    expect(splitInstructions('STEP 1\r\nBoil.\r\n\r\nSTEP 2\r\nEat.')).toEqual(['Boil.', 'Eat.']);
    expect(splitInstructions(null)).toEqual([]);
  });
});

describe('mapIngredientName: what is trusted', () => {
  it('maps exact, plural and prep-stripped names', () => {
    expect(map('Plain Flour')).toMatchObject({ outcome: 'mapped', ingredientId: 'flour' });
    expect(map('Spring Onions')).toMatchObject({ outcome: 'mapped', ingredientId: 'spring-onion' });
    expect(map('Chicken Stock')).toMatchObject({ outcome: 'mapped', ingredientId: 'stock' });
    expect(map('Melted Butter')).toMatchObject({ outcome: 'mapped', ingredientId: 'butter', method: 'stripped' });
    expect(map('Warm Water')).toMatchObject({ outcome: 'mapped', ingredientId: 'water' });
  });

  it('maps plurals the shared singulariser misses ("nuts", "beans", "seeds")', () => {
    expect(plainSingular('Pine Nuts')).toBe('pine nut');
    expect(plainSingular('Tomatoes')).toBe('tomato');
    expect(plainSingular('Chillies')).toBe('chilly'); // plain English rule; "chilli" is reached via the resolver instead
    expect(map('Pine nuts')).toMatchObject({ outcome: 'mapped', ingredientId: 'nuts' });
    expect(map('Green Beans')).toMatchObject({ outcome: 'mapped', ingredientId: 'green-bean' });
    expect(map('Coriander seeds')).toMatchObject({ outcome: 'mapped', ingredientId: 'coriander-seed' });
  });

  it('accepts a partial match whose leftover words are harmless modifiers', () => {
    expect(map('Egg Yolks')).toMatchObject({ outcome: 'mapped', ingredientId: 'egg', method: 'partial' });
    expect(map('Savoy Cabbage')).toMatchObject({ outcome: 'mapped', ingredientId: 'cabbage' });
    expect(map('Baby New Potatoes')).toMatchObject({ outcome: 'mapped', ingredientId: 'potato' });
    expect(map('Basil Leaves')).toMatchObject({ outcome: 'mapped', ingredientId: 'basil' });
  });

  it('applies overrides first: an id maps, null records a decision to leave it unmapped', () => {
    expect(map('Corn Flour')).toMatchObject({ outcome: 'mapped', ingredientId: 'cornflour', method: 'override' });
    expect(map('Egg Plants')).toMatchObject({ outcome: 'mapped', ingredientId: 'aubergine', method: 'override' });
    expect(mapIngredientName('Shallots', lexicon, { shallots: null })).toMatchObject({ outcome: 'unmapped', method: 'override' });
    // An override pointing at an id that doesn't exist must not invent one.
    expect(mapIngredientName('Shallots', lexicon, { shallots: 'shallot' })).toMatchObject({ outcome: 'unmapped' });
  });
});

describe('mapIngredientName: what is held back (found in the first real import)', () => {
  it.each([
    // Leftover words that change what the thing is.
    ['Water Chestnut', 'water', 'left over: chestnut'],
    ['Rose water', 'water', 'left over: rose'],
    ['Egg Rolls', 'egg', 'left over: roll'],
    ['Dill Pickles', 'dill', 'left over: pickle'],
    ['Chicken Liver', 'chicken-breast', 'left over: liver'],
    ['Raspberry Jam', 'berries', 'left over: jam'],
    // A wrong staple hides a missing ingredient.
    ['Roasted pepper', 'black-pepper', 'left over: roasted'],
    ['Padron peppers', 'black-pepper', 'left over: padron'],
    // The fat, not the meat.
    ['Lamb Fat', 'lamb', 'left over: fat'],
    // Allergens the target would drop.
    ['Ground Nut Oil', 'vegetable-oil', 'left over: nut'],
    ['soya milk', 'milk', 'left over: soya'],
    ['Seafood stock', 'stock', 'left over: seafood'],
  ])('%s', (name, candidate, reason) => {
    expect(map(name)).toMatchObject({ outcome: 'ambiguous', ingredientId: null, candidates: [candidate], reason });
  });

  it('calls a tied partial match ambiguous, listing the candidates', () => {
    expect(map('Peanut Oil')).toMatchObject({ outcome: 'ambiguous', candidates: ['nuts', 'vegetable-oil'], reason: 'tie' });
  });

  it('calls a typo match ambiguous rather than guessing', () => {
    expect(map('Tomatoe')).toMatchObject({ outcome: 'ambiguous', method: 'fuzzy', candidates: ['tomato'], reason: 'typo match' });
  });

  it('reports unknown ingredients as unmapped', () => {
    expect(map('Shallots')).toMatchObject({ outcome: 'unmapped', ingredientId: null });
    expect(map('Doubanjiang')).toMatchObject({ outcome: 'unmapped' });
  });
});

describe('allergen and diet word rules', () => {
  it('reads allergens from names, minding false friends', () => {
    expect(impliedAllergens('Ground Nut Oil')).toEqual(['peanut']);
    expect(impliedAllergens('soya milk')).toEqual(['soy']);
    expect(impliedAllergens('Seafood stock')).toEqual(['shellfish']);
    expect(impliedAllergens('Peanut Butter')).toEqual(['peanut']);
    expect(impliedAllergens('Butter Beans')).toEqual([]);
    expect(impliedAllergens('Coconut Milk')).toEqual([]);
    expect(impliedAllergens('Nutmeg')).toEqual([]);
    expect(impliedAllergens('Egg Plants')).toEqual([]);
    expect(impliedAllergens('Oyster Mushrooms')).toEqual([]);
  });

  it('spots meat and fish by name, minding false friends', () => {
    expect(nameSaysMeatOrFish('Chicken Stock Cube')).toBe(true);
    expect(nameSaysMeatOrFish('Lard')).toBe(true);
    expect(nameSaysMeatOrFish('Worcestershire Sauce')).toBe(true);
    expect(nameSaysMeatOrFish('Vegetable Stock')).toBe(false);
    expect(nameSaysMeatOrFish('Kidney Beans')).toBe(false);
    expect(nameSaysMeatOrFish('Oyster Mushrooms')).toBe(false);
    expect(nameSaysMeatOrFish('Beef Tomatoes')).toBe(false);
    expect(nameSaysAnimalProduct('Milk')).toBe(true);
    expect(nameSaysAnimalProduct('Soya Milk')).toBe(false);
    expect(nameSaysAnimalProduct('Peanut Butter')).toBe(false);
  });

  it('refuses a vegetarian tag when a line says chicken, even if it mapped to plain Stock', () => {
    const r = transform('52955');
    expect(r.tags).not.toContain('vegetarian');
    expect(r.status).toBe('needs_review');
    expect(r.reviewReasons).toContain('category is Vegetarian but contains Chicken Stock');
  });

  it('trusts the category when every line agrees', () => {
    const ing = (id: string) => lexicon.byId.get(id)!;
    expect(dietTags('Vegetarian', [{ name: 'Rice', ingredient: ing('rice') }, { name: 'Vegetable Stock', ingredient: ing('stock') }]).tags).toEqual(['vegetarian']);
    expect(dietTags('Vegan', [{ name: 'Chickpeas', ingredient: ing('chickpeas') }]).tags).toEqual(['vegan', 'vegetarian']);
    expect(dietTags('Vegan', [{ name: 'Eggs', ingredient: ing('egg') }])).toEqual({
      tags: ['vegetarian'], conflicts: ['category is Vegan but contains Eggs'],
    });
  });

  it('ignores diet words in free-form source tags', () => {
    expect(vocabularyTags(['Vegetarian', 'Vegan', 'Cake', 'Cheap'])).toEqual(['baking', 'budget']);
  });
});

describe('transformMeal', () => {
  it('builds a ready recipe with provenance, and no invented times or servings', () => {
    expect(transform('52764')).toMatchObject({
      id: 'themealdb-52764',
      slug: 'garides-saganaki-themealdb-52764',
      title: 'Garides Saganaki',
      source: 'themealdb',
      sourceId: '52764',
      licence: 'themealdb-api',
      attribution: 'Recipe from TheMealDB',
      attributionUrl: 'https://www.themealdb.com/meal/52764',
      sourceUrl: 'https://www.themealdb.com/meal/52764', // no strSource, so the TheMealDB page
      imageLicence: 'themealdb',
      importedAt: RAW.fetched_at,
      servings: null,
      prepMinutes: null,
      cookMinutes: null,
      difficulty: null,
      cuisine: 'Greek',
      mealTypes: ['dinner'],
      status: 'ready',
      reviewReasons: [],
    });
    expect(transform('52764').imageUrl).toMatch(/^https:\/\/www\.themealdb\.com\/images\/media\/meals\/.+\.jpg$/);
    expect(transform('52764').videoUrl).toMatch(/^https:\/\/www\.youtube\.com\//);
  });

  it('uses strSource for source_url when present', () => {
    expect(transform('52946').sourceUrl).toBe('https://www.bbcgoodfood.com/recipes/1415664/kung-po-prawns');
    expect(transform('52946').attributionUrl).toBe('https://www.themealdb.com/meal/52946');
  });

  it('holds back a recipe with an unmapped required ingredient, without dropping the line', () => {
    const r = transform('52980');
    expect(r.status).toBe('needs_review');
    expect(r.reviewReasons).toEqual(['unmapped: Shallots']);
    expect(line('52980', 'Shallots')).toMatchObject({ outcome: 'unmapped', display: '2' });
  });

  it('holds back a recipe with a held-back required ingredient', () => {
    expect(transform('52946').reviewReasons).toEqual(['ambiguous: Water Chestnut (water; left over: chestnut)']);
  });

  it('does not let an optional garnish block a recipe', () => {
    const r = transformMeal(
      { idMeal: '1', strMeal: 'Toast', strInstructions: 'Toast it.', strIngredient1: 'Bread', strMeasure1: '1 slice', strIngredient2: 'Shallots', strMeasure2: 'to garnish' },
      { lexicon, importedAt: 'x' },
    );
    expect(r.status).toBe('ready');
  });

  it('copes with no area and no video', () => {
    expect(transform('53393')).toMatchObject({ cuisine: '', videoUrl: null, status: 'ready' });
    expect(transform('52967').videoUrl).toBeNull();
  });

  it('turns country names into cuisine adjectives', () => {
    expect(cuisineForArea('United States')).toBe('American');
    expect(cuisineForArea('France')).toBe('French');
    expect(cuisineForArea('Italian')).toBe('Italian');
    expect(cuisineForArea('Unknown')).toBe('');
    expect(cuisineForArea(null)).toBe('');
  });
});

describe('mealTypesForCategory', () => {
  it('maps courses, and treats main-ingredient categories as dinner', () => {
    expect(mealTypesForCategory('Breakfast')).toEqual(['breakfast', 'brunch']);
    expect(mealTypesForCategory('Dessert')).toEqual(['dessert']);
    expect(mealTypesForCategory('Side')).toEqual(['side']);
    expect(mealTypesForCategory('Seafood')).toEqual(['dinner']);
    expect(mealTypesForCategory(null)).toEqual(['dinner']);
  });
});

describe('toSeedIngredientRows', () => {
  it('merges two lines that land on the same id, keeping both measures', () => {
    const rows = toSeedIngredientRows(transform('52947')); // two Water lines, two spring onion lines
    expect(rows.filter((r) => r.id === 'water')).toEqual([
      expect.objectContaining({ display: '400ml; 2 1/2 tbs', quantity: 400, unit: 'ml' }),
    ]);
    expect(rows.filter((r) => r.id === 'spring-onion')).toHaveLength(1);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });

  it('only emits mapped lines', () => {
    expect(toSeedIngredientRows(transform('52980')).map((r) => r.id)).not.toContain(null);
  });
});

describe('dedupe against the seed catalog', () => {
  it('normalises titles', () => {
    expect(normaliseTitle('Spaghetti  Bolognese!')).toBe(normaliseTitle('spaghetti bolognese'));
    expect(normaliseTitle('Fish & Chips')).toBe(normaliseTitle('Fish and Chips'));
    expect(normaliseTitle('Crème Brûlée')).toBe('creme brulee');
  });

  it('skips a recipe whose title matches a seed recipe, keeping the seed', () => {
    expect(findSeedDuplicate(transform('52770'), seeds, lexicon)).toEqual({
      sourceId: '52770', title: 'Spaghetti Bolognese', seedSlug: 'spaghetti-bolognese', reason: 'title',
    });
  });

  it('skips a differently-named recipe with exactly the same ingredients', () => {
    const base = transform('52764');
    const withIds = (ids: string[]) => ({
      ...base,
      title: 'Something Else Entirely',
      ingredients: ids.map((id, i) => ({ ...base.ingredients[0], position: i + 1, ingredientId: id, importance: 'normal' as const })),
    });
    const seed = { slug: 'seed-stir-fry', title: 'Seed Stir Fry', ingredientIds: ['chicken-breast', 'soy-sauce', 'garlic', 'rice', 'salt'] };

    // Staples don't count towards the signature, so salt vs no salt is still the same dish.
    expect(findSeedDuplicate(withIds(['rice', 'garlic', 'soy-sauce', 'chicken-breast']), [seed], lexicon)).toMatchObject({
      reason: 'ingredients', seedSlug: 'seed-stir-fry',
    });
    expect(findSeedDuplicate(withIds(['rice', 'garlic', 'soy-sauce', 'tofu']), [seed], lexicon)).toBeNull();
    expect(
      findSeedDuplicate(withIds(['egg', 'butter']), [{ slug: 's', title: 'S', ingredientIds: ['egg', 'butter'] }], lexicon),
    ).toBeNull();
  });

  it('catches a one-letter spelling variant, but not a different dish', () => {
    const titled = (title: string) => ({ ...transform('52764'), title });
    expect(findSeedDuplicate(titled('Shakshouka'), seeds, lexicon)).toMatchObject({ seedSlug: 'shakshuka', reason: 'similar title' });
    expect(findSeedDuplicate(titled('Thai prawn curry'), seeds, lexicon)).toBeNull();
    expect(findSeedDuplicate(titled('Vegetarian Shakshuka'), seeds, lexicon)).toBeNull();
  });

  it('does not call unrelated recipes duplicates', () => {
    expect(findSeedDuplicate(transform('52764'), seeds, lexicon)).toBeNull();
  });
});

describe('importCatalog', () => {
  const run = () => importCatalog(RAW, { lexicon, overrides, seeds });

  it('counts, dedupes and orders by id', () => {
    const result = run();
    expect(result.fetched).toBe(11);
    expect(result.duplicates.map((d) => d.sourceId)).toEqual(['52770']);
    expect(result.catalog.recipes.map((r) => r.sourceId)).toEqual([
      '52764', '52767', '52946', '52947', '52955', '52956', '52965', '52967', '52980', '53393',
    ]);
    expect(result.catalog.recipes.filter((r) => r.status === 'ready').map((r) => r.sourceId)).toEqual(['52764', '52967', '53393']);
    expect(result.catalog).toMatchObject({ source: 'themealdb', apiVersion: 'v2', fetchedAt: RAW.fetched_at });
  });

  it('is idempotent: the same input gives byte-identical output and report', () => {
    const a = run();
    const b = run();
    expect(JSON.stringify(b.catalog)).toBe(JSON.stringify(a.catalog));
    expect(buildReport(b, lexicon)).toBe(buildReport(a, lexicon));
  });

  it('is independent of the order meals arrive in', () => {
    const shuffled = { ...RAW, meals: [...RAW.meals].reverse() };
    expect(JSON.stringify(importCatalog(shuffled, { lexicon, overrides, seeds }).catalog)).toBe(JSON.stringify(run().catalog));
  });

  it('ignores a meal listed twice', () => {
    const doubled = { ...RAW, meals: [...RAW.meals, RAW.meals[0]] };
    expect(importCatalog(doubled, { lexicon, overrides, seeds }).catalog.recipes).toHaveLength(10);
  });
});

describe('buildReport', () => {
  const report = buildReport(importCatalog(RAW, { lexicon, overrides, seeds }), lexicon);

  it('states totals and the ready rate', () => {
    expect(report).toContain('| Meals fetched | 11 |');
    expect(report).toContain('| Duplicates of seed recipes (skipped, seed kept) | 1 |');
    expect(report).toContain('**30.0 %**');
  });

  it('ranks unmapped ingredients, with what each would unlock', () => {
    expect(report).toMatch(/\| Shallots \| 1 \| 1 \| 1 \|/);
    expect(report).toMatch(/\| Allspice \| 1 \| 1 \| 1 \|/);
  });

  it('says why a resolvable line was held back', () => {
    expect(report).toContain('| Water Chestnut | 1 | 1 | Water (`water`) | left over: chestnut |');
  });

  it('lays out the fastest path to more ready recipes', () => {
    expect(report).toContain('## Fastest path to more ready recipes');
    expect(report).toMatch(/\| 1 \| \S.* \| 4 \| 40\.0 % \|/);
  });

  it('lists diet conflicts and duplicates', () => {
    expect(report).toContain('Egg Drop Soup (52955): category is Vegetarian but contains Chicken Stock');
    expect(report).toContain('Spaghetti Bolognese (52770) duplicates `spaghetti-bolognese` by title');
  });

  it('only suggests an existing entry that shares a word with the gap', () => {
    // Allspice has no word in common with any taxonomy entry, so no suggestion.
    expect(report).toMatch(/\| Allspice \| 1 \| 1 \| 1 \| — \|/);
  });
});

describe('redactKey', () => {
  it('hides the key wherever it appears, and any key-shaped API path segment', () => {
    expect(redactKey('https://www.themealdb.com/api/json/v2/abc123/search.php?f=a', 'abc123')).toBe(
      'https://www.themealdb.com/api/json/v2/***/search.php?f=a',
    );
    expect(redactKey('failed: abc123', 'abc123')).toBe('failed: ***');
    expect(redactKey('GET https://www.themealdb.com/api/json/v1/zzz/latest.php')).toBe(
      'GET https://www.themealdb.com/api/json/v1/***/latest.php',
    );
  });
});

describe('seedLexicon', () => {
  it('builds from the same data, with the same rules, as the seeder', () => {
    const ids = seedIngredients().map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const ing of seedIngredients()) expect(seedAliasMap().get(ing.name.toLowerCase())).toBe(ing.id);
  });
});

describe('the committed catalogue', () => {
  it('only ever marks a recipe ready when every required line is cleanly mapped', async () => {
    const { default: data } = await import('@/lib/db/data/themealdb.json');
    const recipes = (data as unknown as { recipes: ReturnType<typeof transform>[] }).recipes;
    expect(recipes.length).toBeGreaterThan(0);
    for (const r of recipes.filter((x) => x.status === 'ready')) {
      for (const l of r.ingredients) if (l.importance !== 'optional') expect(l.outcome, `${r.title}: ${l.name}`).toBe('mapped');
      if (r.tags.includes('vegetarian')) {
        for (const l of r.ingredients) expect(nameSaysMeatOrFish(l.name), `${r.title}: ${l.name}`).toBe(false);
      }
    }
  });

  it('is up to date with raw.json, the taxonomy and the rules', async () => {
    const { default: data } = await import('@/lib/db/data/themealdb.json');
    const fs = await import('node:fs');
    const full = JSON.parse(fs.readFileSync('data/sources/themealdb/raw.json', 'utf8')) as TheMealDbRaw;
    const fresh = importCatalog(full, { lexicon, overrides, seeds });
    expect(JSON.stringify(fresh.catalog)).toBe(JSON.stringify(data));
  });
});
