# Catalog phase 1 — audit (Step 0)

**Repo state:** `main` @ `2049dde` (after PR #39). Audit date 2026-11-06.
**Verdict:** the plan fits. The catalogue is built from files in the repo, not stored in Supabase,
and the taxonomy is keyed by id, so neither stop condition applies. Six adjustments to the plan
are listed at the end. Each one is a consequence of how the code is actually built.

---

## 1. Catalog storage

| What | Where |
|---|---|
| Seed recipes (60) | `src/lib/db/data/recipes.ts:45` (`RECIPES: SeedRecipe[]`), type at `:28` |
| Seed ingredients (the taxonomy) | `src/lib/db/data/ingredients.ts:49` (`INGREDIENTS`) |
| DDL, as a TypeScript string | `src/lib/db/schema.ts` (`SCHEMA_VERSION = 4`, `SCHEMA_SQL`, `DROP_SQL`) |
| Seeder (validates, then wipes and inserts) | `src/lib/db/seed.ts` (`seed(db)`; checks for unknown ingredients at `:30`) |
| Connection + build-on-open | `src/lib/db/client.ts` |
| CLI re-seed | `scripts/seed.ts` (`npm run db:seed`) |

**There is no bundled `.db` file, and no SQL migration for the catalogue.** `/data/*.db` is
gitignored (`.gitignore:52-54`). On first open, `client.ts` creates the SQLite file, compares
`PRAGMA user_version` with `SCHEMA_VERSION` (`:78`), drops and recreates on a mismatch, and calls
`seed()` when `recipes` is empty (`:88`). On Vercel, `isReadOnlyDeployment()` (`:24`) sends the
database to `os.tmpdir()` (`:34`), so **each serverless instance builds its own copy from the TS
data on cold start.** Supabase holds only users, saved recipes, pantry, ratings and profiles
(`supabase/migrations/0001-0005`).

Schema (`schema.ts`):

```
ingredients(id PK, name, category, is_staple, allergens JSON, is_spicy)
ingredient_aliases(alias PK, ingredient_id → ingredients)
recipes(id PK, slug UNIQUE, title, description, cuisine, meal_types JSON, servings INT NOT NULL,
        prep_minutes INT NOT NULL, cook_minutes INT NOT NULL, difficulty NOT NULL, emoji NOT NULL,
        tags JSON, instructions JSON)
recipe_ingredients(recipe_id, ingredient_id → ingredients, quantity REAL, unit, note,
                   importance core|normal|optional, PK(recipe_id, ingredient_id))
```

What this means for the import:
- "Import into the DB" means **generating a committed data file that `seed()` reads**, not
  writing rows into a persistent database. Idempotency therefore means the import is
  deterministic: same `raw.json` in, byte-identical data file and report out.
- `servings`, `prep_minutes`, `cook_minutes` and `difficulty` are `NOT NULL`. TheMealDB has none
  of them, so they must become nullable (Step 1).
- The primary key `PK(recipe_id, ingredient_id)` means two TheMealDB lines that resolve to the
  same id (for example "Butter" and "Unsalted Butter") have to be merged, or the insert throws.
- Bumping `SCHEMA_VERSION` is enough to roll the change out. Every instance rebuilds on its next
  cold start, with no migration to run.

## 2. Ingredient taxonomy and matching

- **Defined in** `src/lib/db/data/ingredients.ts` as 143 entries, each with
  `{ id, name, category, staple?, aliases?, allergens?, spicy? }`. `src/lib/taxonomy.ts` is
  something else: meal types, regions and diets.
- **Recipes link by id.** `recipe_ingredients.ingredient_id` is a foreign key to `ingredients.id`,
  and `seed()` throws on an unknown id. **The taxonomy is not keyed by name**, so this stop
  condition does not apply.
- **Staples:** `is_staple` is set on olive oil, vegetable oil, salt, black pepper, sugar, stock,
  baking powder, vinegar and water (`ingredients.ts:148-209`). `scoreRecipe` leaves a staple out
  of coverage when the user hasn't listed it (`src/lib/matching/match.ts:65`). Imported recipes
  get the same rule automatically, as long as their lines map onto those ids.
- **Resolver:** `resolveIngredient()` (`src/lib/matching/normalize.ts:198`) runs in six stages:
  exact → singularised → stop words stripped → prep words stripped → **partial containment**
  (`:250`) → **one-typo fuzzy** (`:264`). Its confidence scores are at `:184`. It already strips
  quantities and units, plurals and prep words (`chopped`, `fresh`, `plain`…), and it covers the
  US/UK names the taxonomy lists as aliases (zucchini, eggplant, cilantro, scallion, shrimp, ground
  beef, heavy cream…). The lexicon is built from names plus aliases in `buildLexicon()` (`:119`) and
  cached by `getLexicon()` (`src/lib/matching/lexicon.ts:13`).
- **The risk for import:** the partial stage picks the longest contained phrase, and on a tie it
  takes **whichever phrase it reaches first**. "Peanut Oil" contains both `peanut` (→ nuts) and
  `oil` (→ vegetable oil); "Sesame Seed Oil" ties `sesame seed` and `sesame oil`. For a pantry
  chip a wrong guess is harmless, because the user sees it. For a recipe it can make the recipe
  look Ready. **So the import treats a partial match with a tie, and any fuzzy match, as
  `ambiguous` (blocking), and lists every single-candidate partial match in the report for
  review.**
- Each pantry entry is resolved to an id, and matching compares sets of ids
  (`matchRecipes`, `match.ts`). Unlock suggestions (`suggestUnlocks`, `:209`) and the basket both
  work on ingredient ids and names, so anything that maps correctly takes part with no further
  work.

## 3. Spoonacular path (which the import must *not* follow)

- The source seam is `RecipeSource` (`src/lib/recipes/types.ts`), and its registry is
  `listRecipeSources()` (`src/lib/recipes/index.ts:25`), returning `[local, spoonacular]`. The
  aggregator queries free sources first and calls metered ones only when fewer than
  `THIN_RESULTS_THRESHOLD = 5` ready matches came back (`:23`, `:76`). `dedupeRecipes()` (`:97`)
  drops external duplicates by normalised title, and local wins ties.
- Spoonacular recipes are mapped at request time by `mapSpoonacularRecipe()`
  (`src/lib/recipes/spoonacular/map.ts`). Unmapped ingredients become synthetic `ext:<slug>`
  ingredients (`:176`) that always count as missing. Times default to `0` when unknown (`:235`),
  `sourceId: 'spoonacular'`, `allergensUnverified: true`.
- **TheMealDB recipes go through the local path.** They are seeded into SQLite, returned by
  `createLocalSource()` (`src/lib/recipes/local-source.ts:21`), and need no new `RecipeSource`. A
  code comment in `index.ts` suggests adding TheMealDB as a live source; that is superseded,
  because the app must not call TheMealDB at runtime.
- **Worth reusing:** `anglicise()` (`map.ts:85`, table at `:64`), a whole-word, case-preserving
  US→UK pass that already covers eggplant, cilantro, zucchini, garbanzo, scallion, arugula, shrimp,
  chili and heavy cream. The import uses it rather than a second table.

## 4. Recipe fields used by the UI

| Field | v1 `RecipeCard` | v1 `RecipeDetail` | v2 `RecipeCardV2` | TheMealDB has it? |
|---|---|---|---|---|
| `imageUrl` | 44px `<img>` (`:56-59`) | 56px `<img>` (`:104-106`) | `RecipeVisual` → `next/image` fill (`RecipeVisual.tsx:45`) | ✅ `strMealThumb` |
| `emoji` | fallback when no image | fallback | not rendered | ❌ (derived from category) |
| `description` (blurb) | always rendered (`:85`) | always rendered (`:147`) | only when non-empty (`:125`) | ❌ none |
| time | `formatMinutes(totalMinutes)` (`:87`) | prep + cook (`:122`) | `Clock` + `formatMinutes` (`:68`) | ❌ |
| servings | `Serves N` (`:87`) | `Serves N` (`:123`) | `Users` + `Serves N` (`:72`) | ❌ |
| difficulty | — | rendered (`:123`) | — | ❌ |
| cuisine | rendered (`:87`) | — | when non-empty (`:74`) | ✅ `strArea` ("Unknown" possible) |
| meal type | — | — | drives the fallback icon in `RecipeVisual` | ✅ via `strCategory` |
| tags | — | chips | — | ✅ `strTags` (free-form) |

- **There is no v2 recipe detail.** `PantryAppV2` renders the v1 `RecipeDetail`
  (`PantryAppV2.tsx:26`, `:778`), so a single attribution change covers both.
- Times are also used by the "max time" filter (`match.ts:184-185`), the matcher's tiebreak sort
  (`:197`) and the v2 "Quickest" sort (`PantryAppV2.tsx:269`). With a nullable time, **a recipe
  whose time is unknown must not pass a "≤ 30 min" filter.** In JavaScript `null <= 30` is
  `true`, so without an explicit check it would pass.
- **Tags drive a filter.** `getAllTags()` feeds the chip filter (`src/app/page.tsx:12`). The seed
  vocabulary has 12 tags (`vegetarian`, `quick`, `budget`, `comfort`, `batch-cook`, `vegan`,
  `one-pan`, `leftovers`, `baking`, `no-cook`, `kids`, `store-cupboard`). Importing TheMealDB's
  free-form tags (`Meat`, `Casserole`, `StrongFlavor`…) would swamp that filter, so the import
  keeps only tags that already exist in that vocabulary, plus `vegetarian`/`vegan` derived from
  `strCategory`. The raw tags are kept in the data file.
- **An existing bug:** Spoonacular recipes with no times already render "0 min" (default at
  `map.ts:235`). It is left alone in this PR, because changing it would alter flag-off output. The
  `formatMeta` helper added here makes the fix one line later.

## 5. Existing source and attribution fields

- `Recipe` (`src/lib/types.ts:45-60`) already has `sourceId?` ('local' when absent), `imageUrl?`,
  `sourceUrl?` and `allergensUnverified?`. **The SQLite schema has none of them**, so they exist
  only on recipes mapped at runtime.
- **`sourceUrl` is never rendered anywhere,** so Spoonacular recipes carry no attribution in the UI
  today. Spoonacular's free tier asks for a backlink. The attribution line added in Step 5 is
  generic, so it can credit Spoonacular too once someone decides to (not done here; that would be
  a flag-off change).
- Saving: a `sourceId` other than `'local'` triggers the snapshot path (`src/lib/saved-recipes.ts:59-61`,
  `src/app/api/saved-recipes/route.ts:31` allows up to 32 characters, and `:105` requires a
  snapshot). `'themealdb'` fits, so a saved TheMealDB recipe keeps rendering even if the flag is
  later turned off.
- Admin: `/admin/recipes` is a **shell** (`src/app/admin/recipes/actions.ts:12`). Its import schema
  uses `importance: 'required' | 'optional'` (`:45`), which doesn't match the database's
  `core | normal | optional`. Out of scope here, but it needs fixing before that form persists
  anything.

## 6. Flags

The "Adding a flag" steps at `src/lib/flags.ts:13-19` are confirmed: add a field to
`FeatureFlags`, a default in `DEFAULTS` (`:64-74`, `redesign: false` is the existing precedent for
off-by-default), an env var in `ENV_VARS` (`:80`), document it in `.env.example`, and gate on it.
`tests/flags.test.ts` has a "covers the full FeatureFlags surface" test that fails if a flag is
missing from `describeFlags()`. Flags are read at request time by `getFlags()` (`:108`), so
`queries.ts` can read it on the server directly.

Also found: `.env.example` says the admin flag is "Off by default", but `DEFAULTS.admin` is `true`.
This is pre-existing drift; the comment is corrected in this PR because it sits next to the new
variable.

---

## Adjustments to the plan

1. **The output is a committed data file, not database rows.** `import-themealdb.ts` writes
   `src/lib/db/data/themealdb.json`, `seed()` loads it next to `RECIPES`, and `(source, source_id)`
   is still a `UNIQUE` constraint, so a duplicate fails the seed loudly.
2. **`needs_review` recipes are kept in the data file but not seeded.** They contain ingredients
   the `recipe_ingredients` foreign key can't reference, and leaving them out of the database
   entirely is the strongest guarantee they never reach matching. The `status` column still exists,
   and `getAllRecipes()` filters on it, which guards against any that slip in.
3. **Aliases specific to TheMealDB go in an import-only override table**
   (`src/lib/catalog/themealdb-overrides.ts`) rather than `ingredients.ts`. A taxonomy alias also
   changes how a user's typed pantry resolves, which breaks the "flag off: identical to `main`" rule.
   The report lists them as proposals to promote into the taxonomy, for David to approve.
4. **Partial matches that tie, and any fuzzy match, count as `ambiguous`** (they block the recipe),
   for the reason given in §2.
5. **Times, servings and difficulty become nullable** across the database, `Recipe` and the UI. The
   time filter excludes recipes whose time is unknown, and time sorts put them last.
6. **The import keeps tags only from the existing vocabulary**, for the reason given in §4.

## Risks and unknowns

- **The ≥ 85 % `ready` target is unlikely to be met with today's taxonomy.** The taxonomy has 143 ingredients
  are mapped, while TheMealDB's ingredient list runs to several hundred (shallots, leeks, fennel,
  pork shoulder, puff pastry, anchovies, Gruyère, mussels…). One unmapped required line sends the
  whole recipe to `needs_review`. The real figure will only be known once the fetch runs on the
  Mac. The report ranks unmapped ingredients by how many recipes each would unlock, so the
  taxonomy can be grown in order of payoff.
- **Thumbnail variant:** this sandbox can't reach themealdb.com (proxy `403`), so the image-size
  suffix couldn't be checked against `api.php`. The code uses `/small` as a single constant,
  `THEMEALDB_THUMB_SUFFIX`. Verify it on the Mac with one `curl -I` (`/preview` is the older
  documented form).
- **Baseline:** `npm test` (22 files, 297 tests) and `npm run lint` pass on `main`.
  `npx tsc --noEmit` reports errors only in `docs/redesign/assets/a11y.spec.ts` (Playwright isn't
  installed). That was already the case and is unrelated.
