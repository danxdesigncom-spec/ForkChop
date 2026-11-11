import type { Ingredient } from '../types';
import { resolveIngredient, suggestCorrection, suggestIngredients, type Lexicon } from './normalize';

/**
 * What the v2B ingredient combobox shows for a query
 * (docs/redesign/07-ingredient-bar-b.md §2). Built only from the existing
 * matching functions; nothing new is decided here.
 *
 * - `ingredients`: the usual autocomplete list.
 * - `correction`: "Did you mean …?", only when autocomplete found nothing and
 *   the resolver can't place the text either. That is the typo state.
 */
export interface FieldSuggestions {
  ingredients: Ingredient[];
  correction: Ingredient | null;
}

export function fieldSuggestions(query: string, lexicon: Lexicon, limit = 8): FieldSuggestions {
  const ingredients = suggestIngredients(query, lexicon, limit);
  if (ingredients.length > 0) return { ingredients, correction: null };
  // The resolver already copes with plurals, prep words and a single typo, so
  // if it lands somewhere confidently, offer that as the one suggestion.
  const resolved = resolveIngredient(query, lexicon);
  if (resolved.ingredientId) {
    const hit = lexicon.byId.get(resolved.ingredientId);
    if (hit && resolved.method !== 'fuzzy') return { ingredients: [hit], correction: null };
    if (hit) return { ingredients: [], correction: hit };
  }
  return { ingredients: [], correction: suggestCorrection(query, lexicon) };
}

/** Catalog names for spoken phrases, for the listening-state preview chips. */
export function resolveNames(phrases: string[], lexicon: Lexicon): { raw: string; name: string | null }[] {
  return phrases.map((raw) => ({ raw, name: resolveIngredient(raw, lexicon).name }));
}
