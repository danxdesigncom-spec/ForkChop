/**
 * Import-only ingredient decisions for TheMealDB, consulted before the shared
 * resolver.
 *
 * Why not just add aliases to src/lib/db/data/ingredients.ts? Because a
 * taxonomy alias also changes how a shopper's typed pantry resolves, and this
 * whole import must leave the app identical to `main` while its flag is off.
 * Decisions land here first; the import report lists them as candidates to
 * promote into the taxonomy once David has approved them.
 *
 * Keys are lower-case TheMealDB ingredient names (after the British English
 * pass), exactly as they appear in the report. Values:
 *   - a taxonomy id  → map to it ("sesame seed oil": "sesame-oil")
 *   - null           → reviewed and deliberately not in the taxonomy; the line
 *                      stays `unmapped` (blocking unless optional), but drops
 *                      out of the report's "needs a decision" list.
 *
 * Mind allergens. Mapping "peanut oil" onto vegetable-oil would drop the peanut
 * allergen from every recipe that uses it, and the allergy filter is strict
 * precisely because a false negative costs a reaction. When the honest answer
 * is a new taxonomy entry, propose one instead.
 *
 * The first entries were added after the first real import (2026-11-13). They
 * are pure naming gaps: each is something the taxonomy already has, spelt
 * differently, with no judgement about whether two products are
 * interchangeable. Anything that needs that judgement ("cumin seeds" for
 * ground cumin? self-raising for plain flour?) is left for David in the
 * report's "decisions needed" lists.
 */
export const THEMEALDB_OVERRIDES: Readonly<Record<string, string | null>> = {
  // One word in the taxonomy, two in TheMealDB.
  'corn flour': 'cornflour',
  'egg plant': 'aubergine',
  'egg plants': 'aubergine',
  // "minced beef" is a taxonomy alias; the resolver doesn't drop "lean".
  'lean minced beef': 'beef-mince',
  // A misspelling of an entry the taxonomy has.
  'ground cardomom': 'cardamom',
};
