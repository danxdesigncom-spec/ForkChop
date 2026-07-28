# ForkChop

Tell ForkChop what's in your kitchen. It finds recipes you can cook right now,
plus the ones you're only an ingredient or two away from — and shows exactly
what you're missing so you can have it delivered.

```bash
npm install
npm run dev
```

Open http://localhost:3000. The database seeds itself on first run.

---

## How it works

Three pieces do the real work.

### 1. Ingredient resolution — `src/lib/matching/normalize.ts`

People don't type canonical ingredient names. They type `2 boneless chicken
breasts`, `extra-virgin olive oil`, `cilantro`, `tomatos`. Every one of those has
to land on a single catalog id or nothing else works.

Resolution runs in stages, and **each stage tries a lookup before the next one
strips more information away**:

| Stage | What it does | Example |
| --- | --- | --- |
| 1 | Drop punctuation, quantities, units | `400g tin of chopped tomatoes` → `of chopped tomatoes` |
| 2 | Singularise | `chicken breasts` → `chicken breast` |
| 3 | Drop grammatical filler | `of chopped tomatoes` → `chopped tomatoes` ✅ |
| 4 | Drop preparation words | `finely diced red onion` → `red onion` ✅ |
| 5 | Partial containment, longest match wins | `free range chicken breast fillets` → `chicken breast` |
| 6 | Levenshtein, budget scaled to word length | `brocoli` → `broccoli` |

The staging is the whole point. Strip prep words too early and `ground
coriander` collapses onto the fresh herb, and `ground beef` onto plain beef.
Separating filler (stage 3) from prep words (stage 4) is what makes `400g tin of
chopped tomatoes` resolve to tinned tomatoes rather than fresh ones. Both cases
are covered in `tests/normalize.test.ts`.

Typo tolerance is deliberately conservative on short words — `rice` and `lime`
are two edits apart, and a confident wrong guess is worse than admitting we
didn't recognise the input. Anything unresolved comes back in `unrecognized`
and is shown to the user rather than silently dropped.

### 2. Ranking — `src/lib/matching/match.ts`

Pure and dependency-free, so it unit tests without a database.

**Not all missing ingredients are equal.** Every recipe ingredient carries an
importance:

- `core` (weight 3) — the dish stops being itself without it
- `normal` (weight 1) — genuinely required
- `optional` (weight 0) — garnish; *never* counted as missing

So missing the chicken sinks a chicken curry, while missing the parsley barely
moves it. Missing items are also sorted core-first, so the UI leads with what
actually matters.

**Staples are assumed.** Salt, pepper, oil, stock, sugar and water are marked
`is_staple` and excluded from the score entirely rather than reported missing —
a pantry of "chicken, rice" shouldn't be penalised for not mentioning salt.
Toggleable per request via `assumeStaples`.

The score:

```
score = 0.72 × coverage      // importance-weighted share of required items held
      + 0.18 × utilization   // share of your pantry the recipe actually uses
      + 0.10 × optionalBonus // tiebreaker
```

Utilization stops a two-ingredient recipe beating a genuinely good match purely
for being small. Results are grouped `ready` → `almost` (≤3 missing) →
`stretch`, then sorted by score within each group.

`suggestUnlocks()` powers the "one more thing unlocks more dinners" row — it
counts recipes that are exactly one ingredient away and ranks by how many each
purchase would unlock.

**Allergies and dislikes are exclusions, not ranking signals.** They run before
scoring, in `isExcluded()`, because an allergen is not something to merely rank
down. The two are deliberately asymmetric:

| | Rule | Why |
| --- | --- | --- |
| **Allergies** | Drops the recipe if *any* ingredient carries the allergen — optional garnishes included | A false negative costs a reaction; a false positive costs one dinner |
| **Dislikes** | Drops the recipe only if a *required* ingredient matches | You can just leave the coriander off a garnish |

Allergens are tagged per ingredient in `ingredients.ts` and validated at seed
time. Err toward over-tagging — `pesto` carries both `dairy` and `tree-nut`,
`soy-sauce` carries both `soy` and `gluten`.

**Spice** follows the dislike rule. `src/lib/spice.ts` is the single source of
truth for both the 🌶️ badge and the "no spicy food" filter, so what the badge
claims and what the filter removes can never drift apart. It separates
unavoidable heat (a required chilli — the badge reads *Spicy*) from avoidable
heat (an optional garnish — *Spicy optional*), and only unavoidable heat is
filtered out. Just five ingredients are tagged `spicy`: chilli, chilli powder,
sriracha, harissa and curry paste. Warming-but-not-hot spices like paprika and
ginger are deliberately excluded — tag those and nearly every recipe reads as
spicy, which makes the badge worthless.

The API also returns `counts.excluded`, so a suddenly short list is explainable
in the UI rather than mysterious.

### Diet, region and meal — `src/lib/taxonomy.ts`

Three more filters, deliberately behaving differently because that is what
people mean by them:

| Filter | Combines as | Example |
| --- | --- | --- |
| **Diet** | AND — they stack | Vegan + gluten-free must both hold |
| **Region** | OR — they widen | Asian + Mediterranean means either |
| **Meal** | OR — they widen | A recipe matches if any of its meals is picked |

Regions and diets are **derived, never stored**. A recipe declares a specific
cuisine (`Greek`) and its ingredients declare their allergens; grouping those
into `mediterranean` and `gluten-free` in one place means a filter can never
disagree with the underlying data. `gluten-free` reuses exactly the allergen
tags the allergy filter uses. Vegetarian and vegan stay author-declared tags —
no ingredient property can tell you whether the stock in a soup was chicken.

Meal types are **multi-valued**: pancakes are `['breakfast', 'brunch']`, so
brunch could be added without pancakes vanishing from breakfast.

`getFacets()` counts how many recipes sit behind each option, so the UI can show
counts and drop any option that would always return nothing.

### 3. Grocery handoff — `src/lib/grocery/`

Missing ingredients feed a basket through the `GroceryProvider` interface. The
app only ever talks to that interface, never to a specific store.

Today it's backed by `mock-provider.ts` — a stand-in with stable hash-derived
prices in **USD**, so the whole flow is real and demoable without a retail
partner.

The basket groups items by **store department** (Produce, Meat & Seafood, Dairy
& Eggs…), so it reads like a route through the store rather than an arbitrary
list. Both the per-item `department` and the `departmentOrder` on the cart come
from the provider — aisle layout is the store's taxonomy, not ForkChop's, so the
UI never hardcodes one. Unrecognised departments sort to the end.

**Three ways to check out.** The picker offers every registered provider plus an
export option that needs no account:

| Option | State |
| --- | --- |
| ForkChop Demo Store | Connected — prices the basket, hands off with a placeholder URL |
| Instacart | Implemented against the real interface; needs `INSTACART_API_KEY` |
| Walmart+ | Implemented against the real interface; needs `WALMART_API_KEY` |
| Shopping list | Always works — print, screenshot, copy or download `.txt` |

Instacart and Walmart+ are real companies, so their providers **do not fake a
connection**. Without credentials they report `configured: false`, `createCart`
throws `ProviderNotConfiguredError`, and `/api/cart` answers `409` with the
setup hint. The UI shows the partner, says plainly that it is not connected,
prints the exact env var needed, and offers the shopping list instead. A
branded checkout button that quietly does nothing would be worse than no button.

**To add a real store:** implement `GroceryProvider` (two methods: `findOffers`
and `createCart`), register it in `src/lib/grocery/index.ts`, and set
`FORKCHOP_GROCERY_PROVIDER` to its id. Nothing in the matcher, the API routes or
the UI changes.

**The shopping list export** (`src/lib/shopping-list.ts`) is provider-free by
design — it groups by store department using the same aisle taxonomy, and is the
one path guaranteed to work when nothing is connected. Printing is scoped to the
list alone via `@media print`, so the printed page is a clean sheet and the same
box is what a screenshot captures.

One deliberate constraint: **nothing in that interface spends money.** Providers
build a basket and return a `checkoutUrl`; the customer pays on the store's own
domain under the store's own auth. ForkChop never handles card details. Keep it
that way — it's what keeps this out of PCI scope.

---

## Adding ingredients: type, scan, or speak

**Barcode** (`/api/barcode`) resolves a scanned code against
[Open Food Facts](https://world.openfoodfacts.org), a free public product
database. Only the number leaves the machine — no user id, no pantry contents,
no cookies. Scanning uses the browser's native `BarcodeDetector`; where that or
the camera is unavailable, the panel falls back to typing the number off the
packet.

Product text is then run through the same normalizer as typed input, with two
constraints that do not apply to typing:

1. **Category tags are tried first.** `en:canned-tomatoes` is clean taxonomy;
   `"Beanz in a rich tomato sauce"` is marketing copy.
2. **Only high-confidence methods are accepted** (`exact`, `alias`, `singular`,
   `stripped`). Partial and fuzzy matching are right for a human typing `chiken
   breast`, but on a marketing name they are a coin flip — during development
   that Heinz baked-beans product resolved to fresh *tomato* purely because the
   phrase contains the word. Returning nothing and offering "add it by name" is
   the better failure.

**Voice** uses the Web Speech API and splits a phrase like *"onions, garlic and
two chicken breasts"* into separate entries; the normalizer handles the rest.
The button hides itself entirely in browsers without speech recognition
(Firefox) rather than failing on click. Recognition is performed by the browser's
own service — on Chrome that means Google's servers. That is the browser's
behaviour rather than something ForkChop routes, but the UI says so.

Both capabilities are read through `useClientCapability`, a `useSyncExternalStore`
wrapper: the server renders "unsupported", the client swaps in the truth after
hydration. No mismatch warning, and no setState inside an effect.

## Project layout

```
src/
  app/
    page.tsx                    server shell
    api/
      recommendations/          POST — the core endpoint
      ingredients/              GET  — catalog + autocomplete
      recipes/[slug]/           GET  — single recipe
      barcode/                  GET  — barcode → ingredient
      saved/                    POST — score saved recipes, unfiltered
      cart/                     POST — missing items → store basket
  components/                   client UI
  lib/
    db/
      schema.ts                 DDL (single source of truth)
      seed.ts                   validating seeder
      queries.ts                typed read layer
      data/
        ingredients.ts          143 canonical ingredients + aliases
        recipes.ts              60 recipes
    matching/
      normalize.ts              free text → ingredient id
      match.ts                  scoring and ranking
    grocery/                    provider interface + mock store
    allergens.ts                the filterable allergen list
    taxonomy.ts                 diet / region / meal, all derived
    shopping-list.ts            provider-free list grouping + .txt export
    spice.ts                    heat detection (badge + filter)
    use-client-capability.ts    SSR-safe browser capability checks
    theme.ts                    score bands + category colours
    pantry-store.ts             localStorage via useSyncExternalStore
tests/                          62 tests, no database needed
```

## Commands

```bash
npm run dev        # dev server
npm run build      # production build
npm test           # vitest
npm run lint       # eslint
npm run db:seed    # rebuild the database after editing seed data
```

## Editing the data

Recipes live in `src/lib/db/data/recipes.ts`, ingredients in
`ingredients.ts`. Run `npm run db:seed` after any change.

The seeder validates before writing and **fails loudly** on an unknown
ingredient id, a duplicate slug, an unknown allergen, or an alias claimed by two
ingredients — a typo should break the seed, not silently produce a recipe that
can never match.

The database is rebuilt from scratch whenever `SCHEMA_VERSION` in `schema.ts`
changes. There is no user data in it to preserve, so a version bump is cheaper
and safer than a migration.

When adding aliases, only add what normalisation can't derive itself. Plurals,
prep words and units are already handled; listing them is just noise.

## API

```bash
curl -X POST localhost:3000/api/recommendations \
  -H 'Content-Type: application/json' \
  -d '{"pantry":["2 chicken breasts","rice","tinned tomatoes"],"assumeStaples":true}'
```

Returns resolved pantry items (with the method used, a confidence score and a
category), anything unrecognised, grouped counts, unlock suggestions, and ranked
matches each carrying `have` / `missing` / `optionalMissing` / `assumedStaples`.

Optional filters: `excludeAllergens`, `dislikedIngredientIds`, `tags`,
`maxTotalMinutes`, `maxMissing`, `limit`.

## My Recipes, and the Login button

Saving a recipe stores its slug locally. `POST /api/saved` scores those recipes
against the pantry but applies **no filtering at all** — not pantry overlap, not
allergies, not dislikes. The user asked for these by name, so hiding one would
be surprising; allergen information is still visible on the recipe itself.

The **Log in** button deliberately does not present a username and password
form. There is no auth backend in this build, and a form that collects
credentials with nowhere to send them trains people to type passwords into
anything that asks. It opens a panel that says what exists and where data
currently lives instead. When real auth arrives, that panel becomes the sign-in
entry point and `saved` / `pantry` / `allergens` / `dislikes` move server-side.

## Design system

The palette lives entirely in CSS custom properties in `globals.css`; nothing
hardcodes a hex value, and light and dark are both first-class.

- **Brand** is pink, matching the cartoon-pig theme. `PigMascot.tsx` is inline
  SVG with `happy` / `hungry` / `sad` moods — no image assets, and it themes
  with everything else.
- **Match rings** are a coverage traffic light: green ≥ 85%, amber ≥ 55%, red
  below. Thresholds live in `scoreBand()` in `src/lib/theme.ts`.
- **Pantry chips** are coloured by ingredient category (produce green, protein
  red, dairy blue, grain amber…), which makes an unbalanced pantry visible at a
  glance. Unrecognised entries go red.
- **Headline counts** sit directly above the recipe cards in `StatsRow.tsx`
  rather than in the page header, so they read alongside the results.

Colours chosen at runtime are applied as inline styles referencing the CSS
variables — Tailwind can only generate classes it can see at build time.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `FORKCHOP_DB_PATH` | `./data/forkchop.db` | SQLite location (`:memory:` works) |
| `FORKCHOP_GROCERY_PROVIDER` | `mock` | Default provider id |
| `INSTACART_API_KEY` | — | Connects the Instacart checkout option |
| `WALMART_API_KEY` | — | Connects the Walmart+ checkout option |

## Notes for later

- **Recipe corpus.** 60 seeded recipes is enough to make the matching feel real,
  not enough for production. The schema and seeding path are ready for a bulk
  import; ingredient normalisation is the hard part of any such import, and
  that's the piece already built.
- **Quantities are not checked.** Having "flour" counts as having flour, even if
  it's a tablespoon and the recipe wants 500g. Needs a pantry quantity model.
- **Substitutions.** The catalog knows `double-cream` and `sour-cream` are
  different things but not that one can stand in for the other. A substitution
  graph would meaningfully improve the `almost` tier.
- **Accounts.** The pantry, allergies and dislikes are per-browser via
  localStorage. Multi-device needs real users.
- **Allergen data is ingredient-level, not product-level.** It knows a recipe
  uses soy sauce and that soy sauce contains gluten; it cannot know what's in
  the specific bottle in your cupboard, or about "may contain" warnings and
  shared production lines. The UI says as much next to the filter. Anything
  safety-critical needs real product data from the grocery provider.
