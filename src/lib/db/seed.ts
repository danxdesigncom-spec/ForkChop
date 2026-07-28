import type DatabaseType from 'better-sqlite3';
import { ALLERGEN_IDS } from '../allergens';
import { INGREDIENTS } from './data/ingredients';
import { RECIPES } from './data/recipes';

/**
 * Wipes and repopulates the catalog + recipe tables. Idempotent, so it is safe
 * to run against an existing database.
 *
 * Throws on any recipe referencing an unknown ingredient id — a typo in
 * recipes.ts should fail here, loudly, rather than silently producing a recipe
 * that can never be matched.
 */
export function seed(db: DatabaseType.Database): { ingredients: number; recipes: number; aliases: number } {
  const knownIds = new Set(INGREDIENTS.map((i) => i.id));

  const problems: string[] = [];
  const seenRecipeIds = new Set<string>();
  const seenSlugs = new Set<string>();

  for (const recipe of RECIPES) {
    if (seenRecipeIds.has(recipe.id)) problems.push(`duplicate recipe id "${recipe.id}"`);
    if (seenSlugs.has(recipe.slug)) problems.push(`duplicate recipe slug "${recipe.slug}"`);
    seenRecipeIds.add(recipe.id);
    seenSlugs.add(recipe.slug);

    const seenIngredients = new Set<string>();
    for (const ing of recipe.ingredients) {
      if (!knownIds.has(ing.id)) {
        problems.push(`recipe "${recipe.slug}" references unknown ingredient "${ing.id}"`);
      }
      if (seenIngredients.has(ing.id)) {
        problems.push(`recipe "${recipe.slug}" lists ingredient "${ing.id}" twice`);
      }
      seenIngredients.add(ing.id);
    }
  }

  for (const ing of INGREDIENTS) {
    for (const allergen of ing.allergens ?? []) {
      if (!ALLERGEN_IDS.includes(allergen)) {
        problems.push(`ingredient "${ing.id}" has unknown allergen "${allergen}"`);
      }
    }
  }

  // Aliases are a primary key, so a collision would throw mid-transaction with
  // a far less useful message than this one.
  const aliasOwner = new Map<string, string>();
  for (const ing of INGREDIENTS) {
    for (const alias of ing.aliases ?? []) {
      const key = alias.toLowerCase().trim();
      const existing = aliasOwner.get(key);
      if (existing) problems.push(`alias "${alias}" claimed by both "${existing}" and "${ing.id}"`);
      aliasOwner.set(key, ing.id);
    }
  }

  if (problems.length > 0) {
    throw new Error(`Seed data is invalid:\n  - ${problems.join('\n  - ')}`);
  }

  const insertIngredient = db.prepare(
    'INSERT INTO ingredients (id, name, category, is_staple, allergens, is_spicy) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const insertAlias = db.prepare('INSERT INTO ingredient_aliases (alias, ingredient_id) VALUES (?, ?)');
  const insertRecipe = db.prepare(`
    INSERT INTO recipes
      (id, slug, title, description, cuisine, meal_types, servings,
       prep_minutes, cook_minutes, difficulty, emoji, tags, instructions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertRecipeIngredient = db.prepare(`
    INSERT INTO recipe_ingredients
      (recipe_id, ingredient_id, quantity, unit, note, importance)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const run = db.transaction(() => {
    db.exec('DELETE FROM recipe_ingredients; DELETE FROM recipes; DELETE FROM ingredient_aliases; DELETE FROM ingredients;');

    for (const ing of INGREDIENTS) {
      insertIngredient.run(
        ing.id,
        ing.name,
        ing.category,
        ing.staple ? 1 : 0,
        JSON.stringify(ing.allergens ?? []),
        ing.spicy ? 1 : 0,
      );
      // The canonical name is itself a lookup key, alongside the explicit aliases.
      insertAlias.run(ing.name.toLowerCase().trim(), ing.id);
      for (const alias of ing.aliases ?? []) {
        const key = alias.toLowerCase().trim();
        if (key !== ing.name.toLowerCase().trim()) insertAlias.run(key, ing.id);
      }
    }

    for (const recipe of RECIPES) {
      insertRecipe.run(
        recipe.id,
        recipe.slug,
        recipe.title,
        recipe.description,
        recipe.cuisine,
        JSON.stringify(recipe.mealTypes),
        recipe.servings,
        recipe.prepMinutes,
        recipe.cookMinutes,
        recipe.difficulty,
        recipe.emoji,
        JSON.stringify(recipe.tags),
        JSON.stringify(recipe.instructions),
      );
      for (const ing of recipe.ingredients) {
        insertRecipeIngredient.run(
          recipe.id,
          ing.id,
          ing.qty ?? null,
          ing.unit ?? null,
          ing.note ?? null,
          ing.importance ?? 'normal',
        );
      }
    }
  });

  run();

  const { n: aliases } = db.prepare('SELECT COUNT(*) AS n FROM ingredient_aliases').get() as { n: number };

  return { ingredients: INGREDIENTS.length, recipes: RECIPES.length, aliases };
}
