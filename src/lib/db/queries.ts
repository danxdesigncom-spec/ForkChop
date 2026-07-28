import { getDb } from './client';
import type { Ingredient, Recipe, RecipeIngredient, Importance, IngredientCategory } from '../types';
import { dietsForRecipe, regionForCuisine } from '../taxonomy';

interface IngredientRow {
  id: string;
  name: string;
  category: string;
  is_staple: number;
  allergens: string;
  is_spicy: number;
}

interface RecipeRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  cuisine: string;
  meal_types: string;
  servings: number;
  prep_minutes: number;
  cook_minutes: number;
  difficulty: string;
  emoji: string;
  tags: string;
  instructions: string;
}

interface RecipeIngredientRow extends IngredientRow {
  recipe_id: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  importance: string;
}

function toIngredient(row: IngredientRow): Ingredient {
  return {
    id: row.id,
    name: row.name,
    category: row.category as IngredientCategory,
    isStaple: row.is_staple === 1,
    allergens: JSON.parse(row.allergens) as string[],
    isSpicy: row.is_spicy === 1,
  };
}

/** Full catalog, used for autocomplete and for building the matcher lexicon. */
export function getAllIngredients(): Ingredient[] {
  return (getDb().prepare('SELECT * FROM ingredients ORDER BY name').all() as IngredientRow[]).map(toIngredient);
}

export function getAliasMap(): Map<string, string> {
  const rows = getDb().prepare('SELECT alias, ingredient_id FROM ingredient_aliases').all() as {
    alias: string;
    ingredient_id: string;
  }[];
  return new Map(rows.map((r) => [r.alias, r.ingredient_id]));
}

/**
 * Every recipe with its ingredients joined in. The dataset is small enough
 * (tens of recipes) that loading it whole and scoring in memory is both simpler
 * and faster than pushing the weighted match into SQL.
 */
export function getAllRecipes(): Recipe[] {
  const db = getDb();
  const recipeRows = db.prepare('SELECT * FROM recipes ORDER BY title').all() as RecipeRow[];

  const ingredientRows = db
    .prepare(`
      SELECT ri.recipe_id, ri.quantity, ri.unit, ri.note, ri.importance,
             i.id, i.name, i.category, i.is_staple, i.allergens, i.is_spicy
      FROM recipe_ingredients ri
      JOIN ingredients i ON i.id = ri.ingredient_id
    `)
    .all() as RecipeIngredientRow[];

  const byRecipe = new Map<string, RecipeIngredient[]>();
  for (const row of ingredientRows) {
    const list = byRecipe.get(row.recipe_id) ?? [];
    list.push({
      ...toIngredient(row),
      quantity: row.quantity,
      unit: row.unit,
      note: row.note,
      importance: row.importance as Importance,
    });
    byRecipe.set(row.recipe_id, list);
  }

  return recipeRows.map((row) => {
    const recipe: Recipe = {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      cuisine: row.cuisine,
      region: regionForCuisine(row.cuisine),
      mealTypes: JSON.parse(row.meal_types) as string[],
      diets: [],
      servings: row.servings,
      prepMinutes: row.prep_minutes,
      cookMinutes: row.cook_minutes,
      totalMinutes: row.prep_minutes + row.cook_minutes,
      difficulty: row.difficulty,
      emoji: row.emoji,
      tags: JSON.parse(row.tags) as string[],
      instructions: JSON.parse(row.instructions) as string[],
      ingredients: byRecipe.get(row.id) ?? [],
    };

    // Needs the ingredients attached, so it runs once the recipe is assembled.
    recipe.diets = dietsForRecipe(recipe);
    return recipe;
  });
}

export function getRecipeBySlug(slug: string): Recipe | null {
  return getAllRecipes().find((r) => r.slug === slug) ?? null;
}

export interface Facet {
  id: string;
  count: number;
}

export interface Facets {
  diets: Facet[];
  regions: Facet[];
  mealTypes: Facet[];
}

/**
 * How many recipes sit behind each filter option, computed over the whole
 * corpus. Lets the UI drop options nothing matches and show counts, so nobody
 * picks a filter that can only ever return zero results.
 */
export function getFacets(): Facets {
  const recipes = getAllRecipes();

  const tally = (values: (r: Recipe) => string[]): Facet[] => {
    const counts = new Map<string, number>();
    for (const recipe of recipes) {
      for (const value of values(recipe)) {
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
    }
    return [...counts.entries()].map(([id, count]) => ({ id, count }));
  };

  return {
    diets: tally((r) => r.diets),
    regions: tally((r) => [r.region]),
    mealTypes: tally((r) => r.mealTypes),
  };
}

/** Distinct tags across the corpus, for the filter UI. */
export function getAllTags(): string[] {
  const tags = new Set<string>();
  for (const recipe of getAllRecipes()) {
    for (const tag of recipe.tags) tags.add(tag);
  }
  return [...tags].sort();
}
