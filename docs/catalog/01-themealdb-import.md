# Catalog phase 1 — Import TheMealDB recipes

**Branch:** `catalog/01-themealdb` · **PR title:** `catalog: import TheMealDB recipes behind a flag`
**Background:** `claude/recipe-catalog-expansion.md` in the ForkChop project (Tier 2). Copy this file
into the repo at `docs/catalog/01-themealdb-import.md` on the first commit.
**Key status (2026-11-06):** lifetime supporter (V2) key purchased. It lives in `.env.local` as
`THEMEALDB_API_KEY` on David's Mac only — never in docs, commits, PR text or Vercel.

---

You are working in the ForkChop repo (Next.js 16.2, React 19.2, Tailwind v4, SQLite seed catalog,
Supabase, Vercel). Read `AGENTS.md` first — this Next.js version has breaking changes, so check
`node_modules/next/dist/docs/` before using any Next API (especially `next/image` config).

## Goal
Grow the local, rankable recipe catalog from 60 seed recipes to several hundred by importing
TheMealDB, with every recipe's ingredients mapped to ForkChop's ingredient taxonomy so it takes
part in Ready / Almost / Stretch matching, the unlock strip and the basket. **No user-visible
change while the new flag is off.**

## Ground rules
- **Audit before building.** ForkChop has a habit of already having the scaffolding; check first.
- Use **only the official API endpoints**. TheMealDB's terms allow copying and modifying content
  returned from the API, but **not scraping the website**. Credit TheMealDB as the source.
- The API key is a script-only secret: `THEMEALDB_API_KEY`, read from `.env.local`. Never
  `NEXT_PUBLIC_`, never logged, never written to `raw.json`, the report, commits or the PR. Redact
  it in any printed URL (`/api/json/v2/***/`). If it's unset, the script exits with a clear error
  (no silent fallback to the test key).
- British English in all copy and in normalised ingredient names.
- No network in tests — use committed fixtures.
- The import runs **on David's Mac** (the cloud sandbox can't reach `themealdb.com`). The app
  itself never calls TheMealDB at runtime; it reads the imported data.

---

## Step 0 — Audit → `docs/catalog/AUDIT.md` (no code changes)
Answer, with file paths and line numbers:
1. **Catalog storage:** where the 60 seed recipes live (SQLite file, seed script, schema/migration),
   how they're loaded at runtime on Vercel (`better-sqlite3`, read-only bundled file?), and the
   exact recipe + ingredient schema.
2. **Ingredient taxonomy:** where it's defined (`taxonomy.ts` etc.), how a recipe ingredient links
   to it (id? slug? name?), how pantry matching keys off it (`src/lib/matching`), and what the typo /
   alias logic can already resolve.
3. **Spoonacular path:** how its recipes are typed and merged with local ones, so imported recipes
   follow the local path, not the Spoonacular one.
4. **Recipe fields used by the UI:** v1 `RecipeCard` / `RecipeDetail` and the v2 `RecipeCardV2`
   (`image_url`, blurb, time, servings, category/cuisine, emoji). Note which TheMealDB lacks.
5. **Existing source/attribution fields**, if any.
6. **Flags:** confirm the "Adding a flag" steps in `src/lib/flags.ts`.

**If the audit shows the plan below doesn't fit (e.g. recipes are already in Supabase, or the
taxonomy is name-keyed with no ids), stop and report to David before Step 1.** Otherwise continue.

## Step 1 — Schema: source and licence fields
Add to the recipe record (SQLite schema + TypeScript type), defaulting existing seed rows to
`source = 'forkchop'`:

| Field | Type | TheMealDB value |
|---|---|---|
| `source` | `'forkchop' \| 'themealdb' \| …` | `'themealdb'` |
| `source_id` | string | `idMeal` |
| `source_url` | string \| null | `strSource` if present, else `https://www.themealdb.com/meal/{idMeal}` |
| `licence` | string | `'themealdb-api'` |
| `attribution` | string | `"Recipe from TheMealDB"` |
| `image_url` | string \| null | `strMealThumb` |
| `image_licence` | string \| null | `'themealdb'` |
| `video_url` | string \| null | `strYoutube` |
| `imported_at` | ISO string | import timestamp |

`(source, source_id)` must be unique, so re-running the import updates rather than duplicates.

## Step 2 — Fetch script: `scripts/catalog/fetch-themealdb.ts`
Run with `npx tsx scripts/catalog/fetch-themealdb.ts`.
- Base URL `https://www.themealdb.com/api/json/v2/{THEMEALDB_API_KEY}/` (the V2 supporter API).
  Check the current endpoint list at https://www.themealdb.com/api.php before coding.
- Enumerate the full catalogue with `search.php?f={a..z}` (and digits if any return results); if
  any letter returns `meals: null`, skip it. Cross-check the total against
  `list.php?c=list` → `filter.php?c={category}` and fetch any missing ids via `lookup.php?i={id}`.
  Also call `latest.php` and confirm those ids are present.
- Be polite: sequential requests, ~250 ms apart, retry with back-off on 429/5xx, `User-Agent:
  ForkChop-catalog-import`.
- Write the raw responses to `data/sources/themealdb/raw.json` (pretty-printed, sorted by
  `idMeal`, so diffs are reviewable) plus `fetched_at` and `api_version: "v2"` — **no key**.
  Commit it — it's the reproducible input to Step 3 and lets the transform run without network.

## Step 3 — Transform: `src/lib/catalog/themealdb.ts` (pure functions) + `scripts/catalog/import-themealdb.ts`
Pure, unit-tested functions; the script just wires them to files and the DB.

1. **Ingredients:** zip `strIngredient1..20` with `strMeasure1..20`, dropping blank/whitespace/null
   pairs. Parse each measure into `{ quantity, unit, note }` — handle `1/2`, `1 ½`, `2-3`, `400g`,
   `1 tin`, `pinch`, `to taste`, `Dusting`, `sliced`. Keep the original string as `display` so
   nothing is lost when parsing is imperfect.
2. **Map to the taxonomy** using the existing matching / alias / typo logic. Output per line:
   `mapped` (taxonomy id), `ambiguous` (top candidates), or `unmapped`. **Never silently drop an
   ingredient** — an unmatched ingredient would make a recipe look "Ready" when it isn't.
   - Recipes with any `unmapped` **required** ingredient are imported with `status = 'needs_review'`
     and excluded from matching until fixed.
   - Pantry basics (water, salt, pepper — whatever the existing seed treats as assumed) follow the
     same rule the seed recipes use.
   - Add aliases to the taxonomy where the gap is just naming (e.g. "Plain Flour", "Caster Sugar",
     "Spring Onions", "Chopped Tomatoes"). Propose new taxonomy entries in the report; **don't
     invent them in bulk without listing them for David to review.**
3. **British English pass** on ingredient display names via a small mapping table
   (`zucchini→courgette`, `cilantro→coriander`, `eggplant→aubergine`, `scallion→spring onion`, …).
   TheMealDB is already largely British; don't touch instruction text beyond trimming.
4. **Instructions:** split `strInstructions` into steps on blank lines / `\r\n`, strip leading
   "STEP 1" / "1." numbering, drop empty steps.
5. **Metadata:** `strCategory` → course/category, `strArea` → cuisine, `strTags` → tags. TheMealDB
   has no times or servings: leave them `null` and make sure the UI hides the meta item rather than
   showing "0 min" (check both v1 and v2 cards).
6. **Dedupe** against the seed catalog by normalised title + ingredient-id set; on a collision keep
   the ForkChop seed recipe and log it.
7. **Report** → `data/sources/themealdb/import-report.md`: totals fetched / imported / needs_review /
   duplicates, the unmapped-ingredient list ranked by frequency (with how many recipes each would
   unlock), and proposed new taxonomy entries + aliases.

## Step 4 — Flag and runtime
- New flag per `src/lib/flags.ts` conventions: `catalogThemealdb` → `NEXT_PUBLIC_FEATURE_CATALOG_THEMEALDB`,
  default **false**, comment `/** Include TheMealDB recipes in the local catalog. */`. Add to
  `.env.example` and `tests/flags.test.ts`.
- With the flag off, recipe queries filter to `source = 'forkchop'` — output identical to `main`.
- With it on, `themealdb` recipes with `status = 'ready'` join the same ranking as seed recipes.
- `next/image`: allow `www.themealdb.com` (path `/images/media/meals/**`) in the image config, using
  the Next 16 API. Use TheMealDB's `/preview` thumbnail variant for cards if it exists, full size
  on the detail page.
- Document `THEMEALDB_API_KEY=` (empty) in `.env.example` as a **script-only** variable, not needed
  on Vercel. Confirm `.env.local` is still gitignored.

## Step 5 — Attribution UI
- Recipe detail (v1 `RecipeDetail` and the v2 equivalent if it exists yet): a small line under the
  method — "Recipe from TheMealDB" linking to `source_url`, plus a "Watch video" link when
  `video_url` is set.
- Cards: no attribution needed on the card itself; keep `alt=""` on images per the v2 spec.
- `/about` (or the existing credits page): "Some recipes and photos are provided by TheMealDB."

## Step 6 — Tests (Vitest, offline)
- Fixture `tests/fixtures/themealdb/` with ~8 real meals from `raw.json`, chosen to cover: fractions,
  ranges, blank ingredient slots, "to taste", a US spelling, a duplicate of a seed recipe, an
  unmappable ingredient, numbered instructions.
- Cases: ingredient zipping, measure parsing, British-English mapping, instruction splitting,
  taxonomy mapping outcomes, dedupe, `needs_review` exclusion from matching, flag-off filtering,
  and key redaction in logged URLs.

## Acceptance checklist
- [ ] `docs/catalog/AUDIT.md` committed and answers all 6 sections.
- [ ] `fetch-themealdb.ts` run on the Mac; `raw.json` committed with the meal count in the PR description.
- [ ] `git grep "$THEMEALDB_API_KEY"` returns nothing across the branch.
- [ ] Import report committed; **≥ 85 % of meals `ready`** (state the actual figure). List the
      top 20 unmapped ingredients in the PR description for David to decide on.
- [ ] Re-running the import is idempotent (no duplicate rows, same report).
- [ ] Flag off: rendered results identical to `main` for the same pantry.
- [ ] Flag on, locally: pantry `chicken, rice, onion, garlic, soy sauce` returns TheMealDB recipes
      in Ready / Almost with photos; missing ingredients add to the basket and price via Kroger.
- [ ] Recipes without time/servings show no broken meta; attribution and video links render.
- [ ] `npm run lint`, `npm test` and `npm run build` pass. No new `NEXT_PUBLIC_` secrets.
- [ ] PR description lists: Vercel **Preview only** `NEXT_PUBLIC_FEATURE_CATALOG_THEMEALDB=true`,
      then redeploy. (`THEMEALDB_API_KEY` is **not** added to Vercel.)

Stop here and summarise for David: meal count, ready %, the unmapped-ingredient decisions he
needs to make, and anything that surprised you in the audit.

---

## Before running (David)
- [x] Lifetime supporter key purchased (2026-11-06). Keep the confirmation email; TheMealDB support
      asks for the PayPal transaction number.
- [ ] Add `THEMEALDB_API_KEY=<your key>` to `.env.local` on the Mac.
- [ ] Re-check https://www.themealdb.com/terms_of_use.php — the terms ask that you credit
      TheMealDB as the source and stay within rate limits.
