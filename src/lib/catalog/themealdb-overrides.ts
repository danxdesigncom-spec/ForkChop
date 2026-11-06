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
 * Empty on purpose until the first real report exists: guessing these from
 * memory, before seeing TheMealDB's actual ingredient list, is exactly the
 * "inventing them in bulk" the brief rules out.
 */
export const THEMEALDB_OVERRIDES: Readonly<Record<string, string | null>> = {};
