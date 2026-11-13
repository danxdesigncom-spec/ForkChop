import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import raw from './fixtures/themealdb/meals.json';
import { importCatalog, toSeedIngredientRows, type TheMealDbRaw } from '@/lib/catalog/themealdb';
import { seedLexicon } from '@/lib/catalog/lexicon';
import { RECIPES } from '@/lib/db/data/recipes';
import { scoreRecipe } from '@/lib/matching/match';
import type { Recipe } from '@/lib/types';
import { RecipeCard } from '@/components/RecipeCard';
import { RecipeCardV2 } from '@/components/v2/RecipeCardV2';
import { RecipeDetail } from '@/components/RecipeDetail';

/**
 * Server-rendered markup for the three surfaces that show recipe meta, with a
 * TheMealDB recipe (no time, servings or difficulty) and a seed recipe.
 */

const lexicon = seedLexicon();
const imported = importCatalog(raw as unknown as TheMealDbRaw, { lexicon, seeds: [] }).catalog.recipes;
const source = imported.find((r) => r.sourceId === '52764')!;

const recipe: Recipe = {
  id: source.id,
  slug: source.slug,
  title: source.title,
  description: source.description,
  cuisine: source.cuisine,
  region: 'mediterranean',
  mealTypes: source.mealTypes,
  diets: [],
  servings: null,
  prepMinutes: null,
  cookMinutes: null,
  totalMinutes: null,
  difficulty: null,
  emoji: source.emoji,
  tags: source.tags,
  instructions: source.instructions,
  ingredients: toSeedIngredientRows(source).map((row) => ({ ...lexicon.byId.get(row.id)!, ...row })),
  sourceId: 'themealdb',
  imageUrl: source.imageUrl,
  sourceUrl: source.sourceUrl,
  attribution: source.attribution,
  attributionUrl: source.attributionUrl,
  videoUrl: source.videoUrl,
};

const seed = RECIPES[0];
const seedRecipe: Recipe = {
  ...recipe,
  id: seed.id,
  slug: seed.slug,
  title: seed.title,
  description: seed.description,
  cuisine: seed.cuisine,
  servings: seed.servings,
  prepMinutes: seed.prepMinutes,
  cookMinutes: seed.cookMinutes,
  totalMinutes: seed.prepMinutes + seed.cookMinutes,
  difficulty: seed.difficulty,
  sourceId: undefined,
  imageUrl: undefined,
  sourceUrl: undefined,
  attribution: undefined,
  attributionUrl: undefined,
  videoUrl: undefined,
};

const pantry = new Set(['prawns', 'onion']);
const noop = () => {};
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const card = (r: Recipe) =>
  renderToStaticMarkup(
    createElement(RecipeCard, { match: scoreRecipe(r, pantry), basket: new Set<string>(), saved: false, onOpen: noop, onToggleBasket: noop, onToggleSaved: noop }),
  );
const cardV2 = (r: Recipe) =>
  renderToStaticMarkup(
    createElement(RecipeCardV2, { match: scoreRecipe(r, pantry), saved: false, onToggleSave: noop, onOpen: noop, inBasket: new Set<string>(), onAddMissing: noop }),
  );
const detail = (r: Recipe) =>
  renderToStaticMarkup(
    createElement(RecipeDetail, {
      match: scoreRecipe(r, pantry), basket: new Set<string>(), saved: false, onClose: noop, onToggleBasket: noop,
      onAddAllMissing: noop, onCheckout: noop, onToggleSaved: noop, rating: null, canRate: false,
      onRate: async () => {}, onSignInRequired: noop,
    }),
  );

describe('recipes with no time or servings', () => {
  it('v1 card shows neither "0 min" nor "Serves", just the cuisine', () => {
    const t = text(card(recipe));
    expect(t).not.toMatch(/\bmin\b|Serves|null/);
    expect(t).toContain('Greek');
    expect(card(recipe)).toMatch(/meals\/[^"]+\.jpg\/small"/); // thumbnail rendition on the 44px card
  });

  it('v2 card drops the time and servings items', () => {
    const t = text(cardV2(recipe));
    expect(t).not.toMatch(/\bmin\b|Serves|null/);
    expect(t).toContain('Greek');
  });

  it('detail page shows no broken meta, and the source measures', () => {
    const t = text(detail(recipe));
    expect(t).not.toMatch(/\bprep\b|\bcook\b ·|Serves|null/);
    expect(t).toContain('Garlic — 1/2 teaspoon');
  });
});

describe('attribution on the detail page', () => {
  it('credits TheMealDB and links the video', () => {
    const html = detail(recipe);
    expect(html).toContain('href="https://www.themealdb.com/meal/52764"');
    expect(text(html)).toContain('Recipe from TheMealDB');
    expect(html).toContain(`href="${recipe.videoUrl}"`);
    expect(text(html)).toContain('Watch video');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('adds an "Original recipe" link when the source names one', () => {
    const html = detail({ ...recipe, sourceUrl: 'https://example.com/original' });
    expect(html).toContain('href="https://example.com/original"');
  });
});

describe('seed recipes render as before', () => {
  it('v1 card keeps time · servings · cuisine', () => {
    expect(text(card(seedRecipe))).toContain(`20 min · Serves ${seed.servings} · ${seed.cuisine}`);
  });

  it('v2 card keeps the time and servings items', () => {
    const t = text(cardV2(seedRecipe));
    expect(t).toContain('20 min');
    expect(t).toContain(`Serves ${seed.servings}`);
  });

  it('detail keeps prep · cook · serves · difficulty, with no attribution line', () => {
    const t = text(detail(seedRecipe));
    expect(t).toContain(`5 min prep · 15 min cook · Serves ${seed.servings} · ${seed.difficulty}`);
    expect(t).not.toContain('TheMealDB');
    expect(t).not.toContain('Watch video');
  });
});
