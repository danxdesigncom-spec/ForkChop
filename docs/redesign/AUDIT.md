# ForkChop v2 — phase 1 audit

Written on `redesign/01-flag` (2026-09-23) against `main` @ `626ed85`. It maps the approved v2
designs (`00-README.md`, `03-components.md`, `04-screens.md`) onto the current code. No code was
changed to produce it.

**Summary**
- Of the 20 listed v1 components, 14 are **rebuilt** as 17 v2 components (mostly thin views over
  logic that stays shared), 5 are **restyled** and 1 (`RecipeDetail`) keeps its logic under a
  restyle. `BarcodeScanner` and `VoiceInput` are reused as they are.
- Lines 100–540 of `PantryApp.tsx` (about 45% of its 962 lines) are logic, not layout. Extract
  them into six hooks before phase 4, not during it.
- There are **57 emoji** rendered in 18 UI files, plus data-driven emoji in `taxonomy.ts` (18),
  `allergens.ts` (11), `grocery/departments.ts` (8), `nav-links.ts` (4), `saved-grouping.ts` (4) and
  every recipe's `emoji` column. All of them have a Lucide replacement below.
- Tokens are clean: all UI colour goes through CSS variables. There are 2 stray `#fff`s and 1 file
  that uses `SCORE_COLOR`.
- Blockers for phases 2–4: `lucide-react`, Fraunces, Playwright and axe aren't installed yet; the
  Kroger provider has no `modality` field at all yet; v2 doesn't redefine the `--pig-*` and `--cat-*`
  tokens; and the root layout's dark mode is `prefers-color-scheme` only.

---

## 1. Component map

Decision key: **Reuse** = keep the file as it is and render it from v2. **Restyle** = keep the
structure and change classes/tokens only. **Rebuild** = a new v2 component, which may still call the
old component's logic.

| v1 component | Lines | v2 replacement | Decision | Notes |
|---|---:|---|---|---|
| `PantryApp` | 962 | `PantryAppV2` (shell exists) | **Rebuild** | Layout only. Logic moves to hooks (§2); both apps call them. |
| `SiteHeader` | 113 | `SiteHeaderV2` | **Rebuild** | Adds the Chef + wordmark, compact `IngredientField` on results, Appearance switch, and the "Skip to recipes" link. Keeps the `View` type and nav state. |
| `HamburgerMenu` | 153 | `SiteHeaderV2` (menu) | **Rebuild** | Folded into the header menu. Link list reused; `link.emoji` dropped. |
| `AccountMenu` | 97 | `SiteHeaderV2` (menu) | **Rebuild** | Sign-out / sync-status logic reused. `⌄` becomes `ChevronDown`. |
| `PantryInput` | 266 | `IngredientField` + `HaveChip` + `QuickAddChip` | **Rebuild** (shell) | **Reuse the parsing, typo suggestions and unresolved-chip logic.** Extract it into `usePantryInput()` so the v2 shell doesn't copy it. |
| `FilterSection` | 85 | `FilterPill` + `FilterPopover` | **Rebuild** | Accordion becomes a pill bar with popovers. `emoji` prop dropped. |
| `FilterBar` | 96 | `FilterPill` (time, tags) | **Rebuild** | Keep the option values and facet counts. |
| `ChipFilter` | 67 | `FilterPopover` option list | **Restyle** | The checkbox-chip list works inside a popover. Drop `option.emoji`; add a check icon for the selected state. |
| `AllergyFilter` | 60 | `FilterPopover` option list | **Restyle** | Same as `ChipFilter`. Keep the "ingredient-level, not product-level" caveat copy. |
| `DislikesInput` | 241 | `FilterPopover` ("Dislikes") | **Restyle** | Autocomplete logic stays. Chips become `HaveChip`-style removable chips. |
| `StatsRow` | 74 | `MatchTabs` | **Rebuild** | Stat tiles lead with "0" (design flags this). Tabs are `role=tablist` with the same counts. |
| `RecipeCard` | 186 | `RecipeCardV2` + `StatusTag` + `MissingChip` | **Rebuild** | Keep `STATUS_LABEL` (move it to `src/lib/` so v2 doesn't import from a v1 component). Save, basket and rating handlers are unchanged. |
| `MatchRing` | 57 | `MatchBadge` | **Rebuild** | Same `scoreBand()` thresholds; the colour mapping changes to brand/saffron/thyme. |
| `BasketPanel` | 683 | `BasketPanelV2` / `BasketSheet` | **Rebuild** (visual) | **Reuse the cart, pricing and checkout logic.** Extract it into `useBasketCheckout()`. The Pickup / Delivery toggle feeds Kroger `modality` (phase 4). |
| `StorePicker` | 143 | inside `BasketPanelV2` | **Restyle** | The ZIP lookup and store-selection logic stay. `📍` becomes `MapPin`. |
| `InfiniteScrollSentinel` | 70 | `Pagination` | **Rebuild** | v2 uses `?page=N`. `paginateBySection()` in `src/lib/pagination.ts` already does the section-preserving maths; add a page-based variant beside it. |
| `PigMascot` | 109 | `ChefPig` (`assets/ChefPig.tsx`) | **Rebuild** | New asset, 5 expressions. The v1 pig reads `--pig-*` tokens, which v2 doesn't redefine (see §5). |
| `SignInPanel` | 176 | `SignInPanel` in a v2 dialog | **Restyle** | Supabase OTP flow unchanged. Method emoji become icons. |
| `RecipeDetail` | 321 | `RecipeDetail` (restyled) | **Reuse** logic, **restyle** | The v2 designs keep the modal. Fix the 5 emoji and switch to Fraunces headings. |
| `ContentPageHeader` | 42 | `SiteHeaderV2` (content variant) | **Rebuild** | About, Privacy and Staples pages use it; they pick up the v2 tokens automatically. |

Not in the brief's list but rendered on the v2 screens:

| v1 component | v2 | Decision |
|---|---|---|
| `BarcodeScanner` (419) | Scan button inside `IngredientField` | **Reuse**: behaviour and camera handling as they are; only the trigger button changes. |
| `VoiceInput` (306) | Speak button inside `IngredientField` | **Reuse** the behaviour; the trigger becomes an `icon` Button. |
| `RecipeRating` (94) | inside `RecipeCardV2` / `RecipeDetail` | **Restyle**: `★☆` become Lucide `Star` (filled/outline). |
| `SavedGroupToggle` (51) | My Recipes segmented control | **Restyle**: drop emoji. |
| `ShoppingListExport` (115) | inside `BasketPanelV2` | **Restyle**: 4 emoji become icons. |
| `SpiceBadge` (42) | meta row in `RecipeCardV2` | **Restyle**: `🌶️` becomes `Flame`. |

## 2. State and logic to share

What `PantryApp.tsx` holds today, split by kind. Line numbers are from `main`.

**Logic (moves to hooks)**

| Concern | Where | Proposed hook |
|---|---|---|
| Pantry, allergens, avoid-spicy, dislikes, saved list (`useSyncExternalStore` on `pantry-store`) | 100–104 | `usePantry()` |
| Add / remove / clear pantry, with Supabase sync and the `syncNotice` | 229–275 | `usePantry()` |
| Toggle allergen, add/remove dislike | 329–358 | `usePantry()` |
| Local-to-account merge on sign-in (`mergeLocalIntoAccount`, `mergeLocalPantry`) | 396–415 | `usePantry()` (or `useAccountSync()`) |
| Filter state: tags, diets, regions, meals, max minutes | 105–109, 416–455 | `useRecipeFilters()` (options + facet counts) |
| Debounced, abortable `POST /api/recommendations` → `data`, `loading`, `error` | 128–188 | `useRecommendations(pantry, filters)` |
| External recipe snapshots (so saved Spoonacular recipes survive) | 189–199 | `useRecommendations()` |
| `GET /api/saved` → `savedMatches`, `toggleSaved` with optimistic update | 200–228, 360–395 | `useSavedRecipes()` |
| Grouping into Ready / Almost / Stretch sections | 456–470 | `useRecommendations()` (derived) |
| Pagination state `revealCount` + reset-on-new-data | 113, 511–540 | v1 only (v2 reads `?page=N` from the URL) |
| Basket `Map`, `toggleBasket`, `addAllMissing`, quantities | 122, 276–327, 950+ | `useBasket()` |
| Ratings fetch and optimistic `onRate` | 115, 471–510 | `useRatings(slugs)` |

**Layout (stays in each app)**

View switching (`view`, `signInOpen`, `basketOpen`, `openMatch`), section headings and blurbs
(`SECTION_BLURB`, `SECTION_COLOR`, `SECTION_SOFT`), the filter sidebar, empty states, the
"one more thing" block and the results grid.

**Proposal.** Extract `usePantry`, `useRecipeFilters`, `useRecommendations`, `useBasket`,
`useSavedRecipes` and `useRatings` into `src/hooks/`, in a PR **of their own at the start of
phase 4** (or the end of phase 3). v1 switches to calling them with no visual change, which the
existing tests plus a flag-off HTML diff can verify, and v2 builds on the same hooks. From
`BasketPanel` and `PantryInput`, also extract `useBasketCheckout()` (provider selection, cart POST,
Kroger OAuth redirect) and `usePantryInput()` (parsing and suggestions). **Nothing is extracted in
this phase.**

## 3. Emoji inventory

57 emoji written directly into 18 UI files (comments excluded), plus the data-driven ones noted in the table. Each maps to a `lucide-react` icon. Icons are
`aria-hidden` wherever the emoji was; where an emoji was the only content of a button, that button
already has an `aria-label` and keeps it.

| File | Emoji | Use | Lucide |
|---|---|---|---|
| `admin/layout.tsx:41` | ← | Back to app | `ArrowLeft` |
| `AccountMenu.tsx:57` | ⌄ | Menu chevron | `ChevronDown` |
| `AllergyFilter.tsx:46` | ✕ | Active allergen | `X` |
| `AllergyFilter.tsx:44` | `{allergen.emoji}` | Allergen icon (data, 11) | drop; show text only (`Check` when active) |
| `BarcodeScanner.tsx:234` | 📷 | Scan a barcode | `ScanBarcode` |
| `BarcodeScanner.tsx:242` | ✕ | Close scanner | `X` |
| `BasketPanel.tsx:34–35, 328` | 🥕 🛒 🛒 | Provider logo fallback | `Store` (Kroger/Instacart logos later, if licensed) |
| `BasketPanel.tsx:305` | ✕ | Remove item | `X` → stepper uses `Minus` / `Plus` / `Trash2` |
| `BasketPanel.tsx:364` | 📝 | Shopping list | `ListChecks` |
| `DislikesInput.tsx:165, 212` | 🌶️ 🌶️ | Avoid spicy | `Flame` |
| `DislikesInput.tsx:173, 195` | ✕ ✕ | Remove chip | `X` |
| `DislikesInput.tsx:187` | 🚫 | Disliked ingredient | `Ban` |
| `FilterSection.tsx:44` | `{emoji}` | Section icon (from `PantryApp`) | per section, below |
| `PantryApp.tsx:571` | 🥗 | Diet filter | `Salad` |
| `PantryApp.tsx:581` | 🌍 | Region filter | `Globe` |
| `PantryApp.tsx:591` | 🍽️ | Meal filter | `UtensilsCrossed` |
| `PantryApp.tsx:600` | ⚠️ | Allergies filter | `TriangleAlert` |
| `PantryApp.tsx:610` | 🚫 | Dislikes filter | `Ban` |
| `PantryApp.tsx:627` | ⏱️ | Time filter | `Timer` |
| `PantryApp.tsx:726` | 🤍 | "Tap the 🤍" copy | inline `Heart` + reword: "Save any recipe to keep it here." |
| `PantryApp.tsx:752` | `{group.emoji}` | Saved group heading (data) | drop |
| `PantryApp.tsx:820` | 🐷 | "One more thing" heading | `Sprout` (design: leaf icon tile) |
| `PantryInput.tsx:187` | 📷 | Scan | `ScanBarcode` |
| `PantryInput.tsx:220` | ⚠ | Unrecognised chip | `CircleAlert` |
| `PantryInput.tsx:228` | ✕ | Remove chip | `X` |
| `RecipeCard.tsx:73` | `{recipe.emoji}` | Card thumbnail (data) | fallback panel (open decision 1) |
| `RecipeCard.tsx:119` | ❤️ / 🤍 | Save | `Heart` (filled / outline) |
| `RecipeCard.tsx:169` | ✓ | In basket | `Check` (`+` becomes `Plus`) |
| `RecipeCard.tsx:173` | ★ | Rating | `Star` |
| `RecipeDetail.tsx:114` | `{recipe.emoji}` | Header (data) | fallback panel |
| `RecipeDetail.tsx:133` | ❤️ / 🤍 | Save | `Heart` |
| `RecipeDetail.tsx:142` | ✕ | Close | `X` |
| `RecipeDetail.tsx:200` | ✓ · ○ | Have / assumed / missing | `CircleCheck` / `CircleDot` / `Circle` |
| `RecipeDetail.tsx:225` | ✓ | "In basket" | `Check` |
| `RecipeDetail.tsx:271` | ✓ | Basket CTA | `Check` |
| `RecipeRating.tsx:81` | ★ / ☆ | Stars | `Star` (filled / outline) |
| `SavedGroupToggle.tsx:14–16` | 🍽️ 🍳 🥗 | Group options | drop (text-only segmented control) |
| `ShoppingListExport.tsx:55` | 🍴 | Shopping list | `ListChecks` |
| `ShoppingListExport.tsx:73` | ☐ | Checkbox glyph | `Square` |
| `ShoppingListExport.tsx:98` | ✓ / 📋 | Copy | `Check` / `Copy` |
| `ShoppingListExport.tsx:105` | ⬇️ | Download .txt | `Download` |
| `SignInPanel.tsx:15–16` | ✉️ 📱 | Sign-in methods | `Mail` / `Smartphone` |
| `SignInPanel.tsx:78` | ✕ | Close | `X` |
| `SiteHeader.tsx:74` | ❤️ / 🤍 | My Recipes | `Heart` |
| `HamburgerMenu.tsx:136` | `{link.emoji}` | Menu links (`nav-links.ts`: 🍳 📖 🧂 🔒) | `House` / `BookOpen` / `Leaf` / `ShieldCheck` |
| `SpiceBadge.tsx:38` | 🌶️ | Spicy | `Flame` |
| `StorePicker.tsx:57` | 📍 | Location | `MapPin` |
| `VoiceInput.tsx:172` | ⏹ / 🎤 | Stop / speak | `Square` / `Mic` |
| `VoiceInput.tsx:278` | ✕ | Close | `X` |

**Data emoji** (they stay in the data and v2 doesn't render them): `taxonomy.ts` (18: diets,
regions, meal types), `allergens.ts` (11), `grocery/departments.ts` (8, used in the shopping list
text export; the `.txt` export can keep them), `nav-links.ts` (4), `saved-grouping.ts` (4), and `recipes.emoji` (60 seed
recipes plus the admin `RecipesTable`).

Enforcement for phase 3: add an emoji-free test over `src/components/v2/**`, as `03-components.md`
asks.

## 4. Token usage

- **All UI colour goes through CSS variables.** `globals.css` defines them in `:root` and in a
  `prefers-color-scheme: dark` block, and exposes them to Tailwind via `@theme inline`.
- **Hard-coded hexes outside `opengraph-image.tsx` / `twitter-image.tsx`:**
  - `RecipeCard.tsx:165`: `color: '#fff'` on the in-basket button. Replace it with `var(--on-brand)`
    (a new v2 token).
  - `PigMascot.tsx:67–68`: `fill="#fff"` eye highlights. Harmless; `PigMascot` isn't used in v2.
- **`SCORE_COLOR` in inline styles:** `MatchRing.tsx:12` (ring stroke and label). Also through the
  `statusStyle` object: `RecipeCard.tsx:54, 65, 70, 127` (top border, thumbnail and tag fills) and
  `StatsRow.tsx:46–54`. v2's `MatchBadge` and `StatusTag` replace all of these with token-backed
  classes.
- **`CATEGORY_COLOR` (via `categoryColor()`) in inline styles:** `PantryInput.tsx:162`,
  `DislikesInput.tsx:144`, `staples/page.tsx:83`.
- **Other inline `var(--…)` styles** (token-backed but inline, because they're chosen at runtime):
  `PantryApp.tsx:872–880` (`SECTION_COLOR` / `SECTION_SOFT`), `BasketPanel.tsx:341, 554`,
  `DislikesInput.tsx:159`. They re-skin correctly under `data-brand="v2"` because they reference
  variables, not values.
- **Coverage gap between v1 and v2 tokens.** `tokens-v2.css` redefines the core palette but **not**
  `--cat-*` (9 pairs) or `--pig-*` (6). Under v2, category colours and the old pig keep their v1
  (pink-era) values. That's fine for the category dot (open decision 2), and `PigMascot` is retired
  in v2, but any v1 screen shown with the flag on will still use them.

## 5. Risks and unknowns

**Blocking or shaping phases 2–4**

1. **Dependencies not installed:** `lucide-react` (phase 2), Fraunces via `next/font/google`
   (phase 2), `@playwright/test` and `@axe-core/playwright` (phase 5). Check each against Next 16.2
   docs before wiring it in.
2. **Kroger `modality` doesn't exist yet.** No grocery code references it; the Kroger cart call
   currently omits it (Kroger's default then applies). Phase 4 needs to thread the Pickup / Delivery
   value from `BasketPanelV2` → `POST /api/cart` → `kroger-provider.ts`, with request validation.
3. **Dark mode is `prefers-color-scheme` only in v1.** Phase 2's System / Light / Dark switch relies on
   `data-theme`, which v1's `globals.css` ignores. Under `data-brand="v2"` the v2 tokens handle it,
   but with the flag off the switch must be hidden (or it'll appear to do nothing).
4. **The theme cookie makes the root layout dynamic.** Reading `fc-theme` via `cookies()` in
   `layout.tsx` opts every route out of static rendering. `/` is already `force-dynamic`; About,
   Privacy and Staples would become dynamic too. That's acceptable, but it's a deliberate change.
   Check the Next 16 docs for `cookies()` behaviour in layouts first.
5. **Remote images.** `RecipeCard` uses a plain `<img>` for Spoonacular's `imageUrl`, and
   `next.config.ts` has no `images.remotePatterns`. `RecipeCardV2` with `next/image` needs
   `img.spoonacular.com` added, or it will throw at runtime on Preview.
6. **`PantryApp` extraction is the riskiest piece of work.** Its effects share abort refs and
   reset-on-data state (`dataForReset`). Do it as its own PR, as proposed in §2.
7. **Pagination semantics change.** v1 reveals cumulatively (`revealCount`); v2 pages with
   `?page=N`. `paginateBySection()` has tests to extend rather than replace.
8. **Flag payload.** With the flag off, the visible HTML is byte-identical to `main`. The RSC payload
   now carries `redesign:false` in the serialised `flags` prop and a `data-brand: $undefined`
   attribute key. Neither renders.

**Open decisions (from the README), with recommendations**

1. **Recipe photos for the 60 seed recipes:** **go with the default.** Use a tinted panel with a
   Lucide category icon (from the recipe's meal type or main category), and fall back to a small chef.
   It needs no new assets and is consistent in both themes. Commission photography separately; the
   `imageUrl` field already exists on `Recipe`, so photos can drop in later with no schema change.
2. **Ingredient category colours:** **go with the default.** Keep `--cat-*` and show category only as
   a small dot on chips in "Your kitchen". I'd add v2 values for `--cat-*` in phase 2 too, so the
   dots sit in the Garden & Radish palette rather than the v1 one.
3. **Page size:** **12 on every device rather than 6 / 8.** A shared `?page=2` link should show the
   same recipes to everyone, and resizing a window shouldn't move you to a different set of recipes.
   6 per page on desktop also means a lot of paging with 60+ results. If the designed density
   matters more, keep 6 / 8, but then generate page links from the item offset rather than the
   page number.
