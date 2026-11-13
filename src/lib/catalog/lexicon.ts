import { INGREDIENTS } from '../db/data/ingredients';
import { buildLexicon, type Lexicon } from '../matching/normalize';
import type { Ingredient } from '../types';

/**
 * The same lexicon `getLexicon()` builds at runtime, but straight from the seed
 * files instead of the SQLite tables they're loaded into.
 *
 * The importer must resolve ingredients exactly as the running app will, yet
 * it runs before (and independently of) any database. Building from the same
 * source data with the same rules as seed.ts (the canonical name plus every
 * alias, lower-cased and trimmed) keeps the two in lockstep. A test pins that
 * equivalence.
 */
export function seedIngredients(): Ingredient[] {
  return INGREDIENTS.map((ing) => ({
    id: ing.id,
    name: ing.name,
    category: ing.category,
    isStaple: Boolean(ing.staple),
    allergens: [...(ing.allergens ?? [])],
    isSpicy: Boolean(ing.spicy),
  }));
}

export function seedAliasMap(): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const ing of INGREDIENTS) {
    aliases.set(ing.name.toLowerCase().trim(), ing.id);
    for (const alias of ing.aliases ?? []) aliases.set(alias.toLowerCase().trim(), ing.id);
  }
  return aliases;
}

export function seedLexicon(): Lexicon {
  return buildLexicon(seedIngredients(), seedAliasMap());
}
