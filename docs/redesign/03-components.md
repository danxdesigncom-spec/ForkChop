# Phase 3 — v2 component set

**Branch:** `redesign/03-components` · **PR title:** `redesign: v2 components`

Read `AGENTS.md`, `docs/redesign/00-README.md` and `AUDIT.md`. Open the design canvas → *Final designs*
for exact spacing. The *Brand & style guide* board has every component spec, and *Accessibility
audit v2* lists the rules each one must meet. The canvas boards are HTML, so inspect them for exact
values.

All new files go in `src/components/v2/`. Use Tailwind utilities backed by the tokens, with **no
raw hex values**. Use Lucide icons, not emoji. British English copy.

## Components

| Component | Replaces | Key spec |
|---|---|---|
| `Button` | ad-hoc buttons | `primary` (brand fill, `on-brand` label), `secondary` (surface + line), `ghost` (brand text), `icon` (requires `aria-label`). **min-height** 48 (44 on mobile), radius 12, 15px/600 label. `disabled` uses the raised fill, thyme text and `cursor-not-allowed`, and takes an `aria-describedby` reason. |
| `IngredientField` | `PantryInput` (visual shell only; **reuse its parsing and typo logic**) | Wrapper has the `field` class (line-strong border, radius 14–18, focus ring via `:focus-within`). The input stretches to full field height. Scan and Speak are `icon` buttons inside it (reuse `BarcodeScanner` and `VoiceInput` behaviour). Enter or comma adds; Backspace on empty removes the last chip. Visually hidden `<label>`. |
| `HaveChip` | pantry chips | `chip-have` fill, `chip-have-fg` text, remove button ≥24px with `aria-label="Remove {name}"`. |
| `QuickAddChip` | quick-add buttons | Dashed `line-strong` border, `+` icon, min-height 36. |
| `UnlockChip` | "one more thing" chips | Sprout-bordered white chip: `+ {name}` plus `+1 recipe` in brand text. `aria-label="Add {name} to basket"`. |
| `MissingChip` | missing-ingredient chips on cards | Surface chip with a brand `+` icon. `aria-label="Add {name} to basket"`. |
| `FilterPill` + `FilterPopover` | `FilterSection`, `FilterBar`, `ChipFilter`, `AllergyFilter`, `DislikesInput` layout | Horizontal pill bar inside `<section aria-label="Filters and sort">`. Pill = button with a chevron that opens a popover (`aria-expanded`, `aria-controls`). An active pill shows a **check icon** plus `aria-pressed="true"` and sprout fill. Popover: Esc closes and returns focus; reuse the existing option lists and facet counts. "All filters" opens a full sheet on mobile. |
| `MatchBadge` | `MatchRing` | 44px ring: Ready = brand, Almost = saffron, Stretch = thyme. Number in Geist Mono. SVG `aria-hidden`; visually hidden text "88 percent match. Missing 1: Basil." |
| `StatusTag` | `STATUS_LABEL` tags | "Ready to cook" (sprout, check icon), "Missing N" (saffron-soft / saffron-text). **min-height**, not height. |
| `RecipeCardV2` | `RecipeCard` | Photo area 188px (desktop) or 96×112 thumbnail (mobile); `image_url` via `next/image` with `alt=""` (the title is adjacent). Fallback per the README decision. Save button 44px (`aria-label="Save {title}"`), Fraunces title 21px, blurb, meta row (`white-space: nowrap` items), footer with `StatusTag` or `MissingChip`s. The whole card isn't a link; the title opens `RecipeDetail`. |
| `MatchTabs` | `StatsRow` | `role=tablist`: "Ready · N / Almost · N / All · N", arrow-key navigation, wired to a `role=tabpanel`. **Replaces the stat tiles, which lead with "0".** |
| `UnlockStrip` | "one more thing unlocks" block | Sprout panel with a leaf icon tile, heading, and `UnlockChip` row (`overflow-x: auto` on mobile). |
| `Pagination` | `InfiniteScrollSentinel` | `<nav aria-label="Recipe pages">`: Previous / numbers / Next. Current page `aria-current="page"` (brand fill). Disabled ends are `<button disabled>`. Status text "Showing 1–6 of 21" with `role="status"`. Mobile: prev icon · "Page X of Y" · Next. |
| `BasketPanelV2` / `BasketSheet` | `BasketPanel` (visual; **reuse its cart and pricing logic**) | Desktop: sticky aside. Mobile: bottom sheet `role="dialog"` `aria-modal`, focus trap, Esc closes. Stepper buttons named "Increase {item} quantity". **Fulfilment segmented control Pickup / Delivery** (`aria-pressed`); this value feeds the Kroger `modality` in phase 4. Empty state: thinking chef, "Nothing in here yet", disabled Send with the reason. |
| `EmptyState` | ad-hoc empties | Chef expression + Fraunces heading + body + optional actions. |
| `SiteHeaderV2` | `SiteHeader`, `HamburgerMenu`, `AccountMenu` | Chef + wordmark ("fork" ink, "chop" brand), compact `IngredientField` in the header on results (desktop), My Recipes, Log in (`white-space: nowrap`), menu with the **Appearance** switch from phase 2. Skip link "Skip to recipes" is the first element inside `<nav>`. |
| `YourKitchenPopover` | new | Opens from "+N more" in the header (`aria-expanded`): all `HaveChip`s, Clear all, Done. Mobile equivalent: "Show all N" toggle. |

## Rules for every component
- A native element first (`button`, `a`, `input`, `select`); never `onClick` on a `div`.
- A visible focus via the global ring; don't override `outline` without supplying the ring.
- Targets ≥24px (2.5.8), primary actions ≥44px.
- Test in both themes. No colour is hard-coded, so dark should just work; verify anyway.

## Acceptance checklist
- [ ] A temporary `/dev/components` gallery route (flag-gated, deleted before phase 6) shows every
      component and state in light and dark.
- [ ] Keyboard: Tab, Shift+Tab, Enter/Space and Esc behave as specified; the tabs support arrow keys.
- [ ] Vitest unit tests for `Pagination` (range maths, disabled ends) and `MatchBadge` (band thresholds
      match `scoreBand`).
- [ ] No emoji in `src/components/v2/**` (add an ESLint `no-restricted-syntax` or a simple test).
- [ ] lint, test and build pass; the flag-off build is unchanged.
