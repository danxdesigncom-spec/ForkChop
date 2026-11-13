# Phase 4 — v2 screens, page numbers, Kroger `modality`

**Branch:** `redesign/04-screens` · **PR title:** `redesign: v2 screens + Kroger modality fix`

Read `AGENTS.md`, `00-README.md`, `AUDIT.md` and `03-components.md`. The canvas *Final designs* page
is the reference for every screen and state, in light (sections 02–03) and dark (section 05).

## 0. Extract shared logic first (small, separate commit)
Per AUDIT.md §2, move the non-visual logic out of `PantryApp.tsx` into hooks: `usePantry`,
`useRecommendations`, `useBasket`, `useFilters`. Have **v1 `PantryApp` use them too**, so there's one
source of truth. v1 behaviour must not change: run the full test suite and click through v1 with
the flag off.

## 1. `PantryAppV2` layout
Replace the phase-1 passthrough with the real v2 layout, built from `src/components/v2/*`.

**Home (no ingredients yet)**: centred hero with the happy chef, "Cook what you already have." (Fraunces
76 desktop / 36 mobile), large `IngredientField` with a "Find recipes" primary button, quick-add
chips, and the 3-step explainer cards. Mobile: sticky bottom CTA "Show N recipes", **disabled with a
reason** ("Add at least one ingredient to see recipes.") when the pantry is empty.

**Results**: header with the compact field and chips. When there are more than 4 chips, show the
first 4 plus "+N more", which opens `YourKitchenPopover`. Below it, the filter pill bar and Sort
`select`. Then:
- `h1`: "You can cook N dinners tonight" (Ready > 0), otherwise "You're close to N dinners". On mobile
  the h1 is visually hidden and the header shows "N ingredients · Edit ingredients".
- `MatchTabs` (default tab: Ready if > 0, otherwise Almost).
- `UnlockStrip` when unlock suggestions exist.
- Card grid: 3 columns desktop, list mobile.
- `Pagination`.
- Desktop: `BasketPanelV2` sticky in the right column. Mobile: a floating "N items in basket ·
  Review" bar that opens `BasketSheet`. Add `scroll-padding-bottom: 96px` so the bar never
  hides focused elements (WCAG 2.4.11).

**No ingredients on the results route**: `EmptyState` (thinking chef) with quick-add chips and two
starter sets, "Store-cupboard basics" and "Fridge staples". Reuse the `/staples` data for the sets.

## 2. Page numbers (replace infinite scroll in v2)
- Add `paginateByPage(sections, order, page, pageSize)` to `src/lib/pagination.ts`. It flattens in
  section order and returns `{ visible, page, pageCount, from, to, total }`. Keep
  `paginateBySection` for v1. Add Vitest cases (page 1, a middle page, the last partial page,
  out-of-range → clamp, empty).
- URL state: `?page=N` (use the Next 16 search-params API). Changing filters, tabs or ingredients
  resets to page 1.
- On page change: scroll to the results and move focus to the results `h1`
  (`tabIndex={-1}`); the status text announces "Showing 7–12 of 21".
- Page size per the README decision (default desktop 6, mobile 8).

## 3. Kroger `modality` fix (the empty-cart bug)
Root cause: `KrogerCartLine` in `src/lib/grocery/kroger-api.ts` sends only `{ upc, quantity }`, and
Kroger silently drops lines without a fulfilment context.
- Add `modality: 'PICKUP' | 'DELIVERY'` to `KrogerCartLine`, and include it in the `/cart/add`
  payload for every line.
- Thread it from the basket's Pickup / Delivery control → basket state → the cart API route
  (`src/app/api/cart/…`) → `kroger-provider.ts` → `kroger-api.ts`. Validate it with zod on the
  server, defaulting to `PICKUP`.
- Remember the choice with the existing store preference (`src/lib/store-preference.ts`).
- Update `tests/kroger.test.ts` so the payload includes `modality` and an invalid value is rejected.
- This fix must work in **v1 too**. The v1 basket has no toggle, so it defaults to `PICKUP`.

## 4. Copy (British English)
Use the copy from the canvas boards verbatim: "One more ingredient unlocks:", "Nothing in here
yet", "Tap + on any missing ingredient to add it here.", "Add at least one item to send your basket
to Kroger.", "Your kitchen's looking empty", "You'll check out on Kroger. ForkChop never sees
payment details."

## 5. Screen-reader announcements
A single polite live region in `PantryAppV2`:
- Ingredient added or removed → "Garlic added. 21 recipes, 0 ready to cook."
- Basket change → "Basil added to basket. 3 items."
Debounce by 400 ms so fast typing doesn't spam announcements.

## 6. Errors (WCAG 3.3.1 / 3.3.3)
- Unrecognised ingredient: inline message under the field, "We don't know 'corgette' yet. Did you
  mean **courgette**?", with the suggestion as a button. Reuse the typo matching in
  `src/lib/matching`.
- Kroger failure or empty cart response: an inline alert in the basket with Retry (`role="alert"`).

## Acceptance checklist
- [ ] Every state on the canvas exists in the app: Home, Results p1, Results p2 with an empty basket,
      24 ingredients (popover open), No ingredients, and on mobile Home, Home with 24, Empty,
      Results, Basket, Empty basket. Check each in light and dark.
- [ ] `?page=` survives reload and the back button; filters reset it to page 1.
- [ ] **End-to-end on Preview:** sign in to Kroger, send 2 items with Pickup → both appear in the
      Kroger cart. Repeat with Delivery.
- [ ] v1 (flag off) still works, including the Kroger fix.
- [ ] lint, test and build pass.
