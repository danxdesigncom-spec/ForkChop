import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import raw from './fixtures/themealdb/meals.json';
import { importCatalog, type TheMealDbRaw } from '@/lib/catalog/themealdb';
import { seedLexicon } from '@/lib/catalog/lexicon';
import { enabledCatalogSources } from '@/lib/catalog/sources';
import { THEMEALDB_OVERRIDES } from '@/lib/catalog/themealdb-overrides';
import type { ImportedRecipe } from '@/lib/catalog/types';
import { RECIPES } from '@/lib/db/data/recipes';
import { buildLexicon, resolvePantry } from '@/lib/matching/normalize';
import { matchRecipes } from '@/lib/matching/match';
import { getFlags } from '@/lib/flags';

/**
 * End to end through SQLite: seed the fixtures, read them back through the same
 * queries the app uses, and match against a pantry. An in-memory database, so
 * nothing touches data/forkchop.db.
 */

vi.stubEnv('FORKCHOP_DB_PATH', ':memory:');

const lexicon = seedLexicon();
const seeds = RECIPES.map((r) => ({ slug: r.slug, title: r.title, ingredientIds: r.ingredients.map((i) => i.id) }));
const imported = importCatalog(raw as unknown as TheMealDbRaw, { lexicon, overrides: THEMEALDB_OVERRIDES, seeds }).catalog.recipes;
const ready = imported.filter((r) => r.status === 'ready');

type Queries = typeof import('@/lib/db/queries');
type Seed = typeof import('@/lib/db/seed');
type Client = typeof import('@/lib/db/client');
let q: Queries;
let s: Seed;
let c: Client;

beforeAll(async () => {
  c = await import('@/lib/db/client');
  s = await import('@/lib/db/seed');
  q = await import('@/lib/db/queries');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('FORKCHOP_DB_PATH', ':memory:');
});

const reseed = (recipes: ImportedRecipe[]) => s.seed(c.getDb(), recipes);

describe('seeding imported recipes', () => {
  it('inserts ready recipes alongside the 60 seed recipes', () => {
    const result = reseed(ready);
    expect(result).toMatchObject({ recipes: 60, imported: 3 });
    const { n } = c.getDb().prepare("SELECT COUNT(*) AS n FROM recipes WHERE source = 'themealdb'").get() as { n: number };
    expect(n).toBe(3);
  });

  it('refuses a needs_review recipe outright', () => {
    const review = imported.find((r) => r.status === 'needs_review')!;
    expect(() => reseed([...ready, review])).toThrow(/needs_review, not ready/);
  });

  it('only ever offers ready recipes to the seeder', () => {
    const file = { source: 'themealdb' as const, apiVersion: 'v2', fetchedAt: null, recipes: imported };
    expect(s.importedRecipesToSeed([file]).map((r) => r.sourceId)).toEqual(ready.map((r) => r.sourceId));
  });

  it('enforces (source, source_id) uniqueness', () => {
    const clash = { ...ready[1], sourceId: ready[0].sourceId };
    expect(() => reseed([ready[0], clash])).toThrow(/duplicate source id "themealdb:52764"/);
  });

  it('is idempotent: re-seeding gives the same rows', () => {
    reseed(ready);
    const first = q.getAllRecipes(['forkchop', 'themealdb']);
    reseed(ready);
    expect(q.getAllRecipes(['forkchop', 'themealdb'])).toEqual(first);
  });
});

describe('flag off: the catalogue is exactly main', () => {
  it('defaults the flag off, so only ForkChop recipes are enabled', () => {
    expect(getFlags().catalogThemealdb).toBe(false);
    expect(enabledCatalogSources(getFlags())).toEqual(['forkchop']);
  });

  it('returns the same recipes whether or not imported ones are in the database', () => {
    reseed([]);
    const before = q.getAllRecipes();
    reseed(ready);
    const after = q.getAllRecipes();
    expect(after).toEqual(before);
    expect(after).toHaveLength(60);
    // No provenance fields leak onto seed recipes, so API responses are unchanged too.
    for (const recipe of after) {
      expect(recipe).not.toHaveProperty('sourceId');
      expect(recipe).not.toHaveProperty('attribution');
      expect(recipe.ingredients.every((i) => !('display' in i))).toBe(true);
      expect(typeof recipe.totalMinutes).toBe('number');
    }
  });

  it('keeps facets and tags identical', () => {
    reseed([]);
    const facets = q.getFacets();
    const tags = q.getAllTags();
    reseed(ready);
    expect(q.getFacets()).toEqual(facets);
    expect(q.getAllTags()).toEqual(tags);
  });

  it('does not find an imported recipe by slug', () => {
    reseed(ready);
    expect(q.getRecipeBySlug(ready[0].slug)).toBeNull();
  });
});

describe('flag on: imported recipes join the same ranking', () => {
  it('reads the flag from NEXT_PUBLIC_FEATURE_CATALOG_THEMEALDB', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_CATALOG_THEMEALDB', 'true');
    expect(enabledCatalogSources(getFlags())).toEqual(['forkchop', 'themealdb']);
    reseed(ready);
    expect(q.getAllRecipes()).toHaveLength(63);
    expect(q.getRecipeBySlug(ready[0].slug)?.title).toBe('Garides Saganaki');
  });

  it('carries provenance, nullable meta and the original measures', () => {
    reseed(ready);
    const recipe = q.getAllRecipes(['forkchop', 'themealdb']).find((r) => r.slug === ready[0].slug)!;
    expect(recipe).toMatchObject({
      sourceId: 'themealdb',
      attribution: 'Recipe from TheMealDB',
      attributionUrl: 'https://www.themealdb.com/meal/52764',
      imageUrl: expect.stringMatching(/^https:\/\/www\.themealdb\.com\/images\/media\/meals\//),
      videoUrl: expect.stringMatching(/^https:\/\/www\.youtube\.com\//),
      licence: 'themealdb-api',
      servings: null,
      prepMinutes: null,
      cookMinutes: null,
      totalMinutes: null,
      difficulty: null,
    });
    expect(recipe.ingredients.find((i) => i.id === 'garlic')).toMatchObject({ quantity: 0.5, unit: 'tsp', display: '1/2 teaspoon' });
  });

  it('never returns a needs_review row, even one inserted behind the seeder’s back', () => {
    reseed(ready);
    c.getDb()
      .prepare(
        `INSERT INTO recipes (id, slug, title, description, cuisine, meal_types, emoji, tags, instructions, source, source_id, status)
         VALUES ('x', 'x', 'Sneaky', '', '', '["dinner"]', '🍽️', '[]', '[]', 'themealdb', 'x', 'needs_review')`,
      )
      .run();
    c.getDb().prepare("INSERT INTO recipe_ingredients (recipe_id, ingredient_id) VALUES ('x', 'rice')").run();
    expect(q.getAllRecipes(['forkchop', 'themealdb']).map((r) => r.slug)).not.toContain('x');
  });

  it('ranks with the seed corpus: a fixture recipe comes back Ready', () => {
    reseed(ready);
    const lx = buildLexicon(q.getAllIngredients(), q.getAliasMap());
    const pantry = resolvePantry(['prawns', 'onion', 'parsley', 'white wine', 'chopped tomatoes', 'garlic', 'feta'], lx).map((r) => r.ingredientId!);
    const matches = matchRecipes(q.getAllRecipes(['forkchop', 'themealdb']), pantry);
    const ours = matches.find((m) => m.recipe.slug === ready[0].slug)!;
    expect(ours.status).toBe('ready');
    expect(ours.assumedStaples.map((i) => i.id)).toEqual(['olive-oil']);
  });

  it('acceptance: chicken, rice, onion, garlic, soy sauce finds imported recipes, with photos', () => {
    reseed(s.importedRecipesToSeed()); // the full committed catalogue
    const lx = buildLexicon(q.getAllIngredients(), q.getAliasMap());
    const pantry = resolvePantry(['chicken', 'rice', 'onion', 'garlic', 'soy sauce'], lx).map((r) => r.ingredientId!);
    const matches = matchRecipes(q.getAllRecipes(['forkchop', 'themealdb']), pantry);
    const imported = matches.filter((m) => m.recipe.sourceId === 'themealdb' && (m.status === 'ready' || m.status === 'almost'));
    expect(imported.length).toBeGreaterThan(0);
    expect(imported.every((m) => m.recipe.imageUrl)).toBe(true);
    // Missing ingredients are real taxonomy ingredients, so they can go in the basket.
    for (const m of imported) for (const i of m.missing) expect(lx.byId.has(i.id)).toBe(true);
  });

  it('excludes unknown-time recipes from a time limit, and sorts them after known times', () => {
    reseed(ready);
    const lx = buildLexicon(q.getAllIngredients(), q.getAliasMap());
    const pantry = resolvePantry(['flour', 'milk', 'sugar', 'eggs', 'yeast'], lx).map((r) => r.ingredientId!);
    const all = q.getAllRecipes(['forkchop', 'themealdb']);
    const timed = matchRecipes(all, pantry, { maxTotalMinutes: 600 });
    expect(timed.some((m) => m.recipe.sourceId === 'themealdb')).toBe(false);
    expect(matchRecipes(all, pantry).some((m) => m.recipe.sourceId === 'themealdb')).toBe(true);
  });
});

describe('seed lexicon matches the runtime lexicon', () => {
  it('resolves every phrase to the same id as getLexicon() would', () => {
    reseed([]);
    const runtime = buildLexicon(q.getAllIngredients(), q.getAliasMap());
    const sorted = (m: Map<string, string>) => [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
    expect(sorted(lexicon.phrases)).toEqual(sorted(runtime.phrases));
  });
});
