# Phase 7 — Ingredient bar, version B ("input first, kitchen tray")

**Branch:** `redesign/07-ingredient-bar` · **PR title:** `redesign: ingredient bar v2B (input first, kitchen tray)`
**Design source:** canvas "ForkChop — Ingredient bar alternatives" → row **B**
(https://claude.ai/artifact/CV9oVAPQAxPWUehL8vVDV1). Boards: *B · Input first, kitchen tray — Desktop* and *— Mobile*.
Inspect the boards' HTML for exact spacing and values; they use the v2 tokens in `tokens-v2.css`.
**Approved by David:** 2026-11-07. Copy this file into the repo at `docs/redesign/07-ingredient-bar-b.md` on the first commit.

You are working in the ForkChop repo (Next.js 16.2, React 19.2, Tailwind v4, Supabase, Vercel). Read `AGENTS.md`
first. This Next.js version has breaking changes, so check `node_modules/next/dist/docs/` before using any Next API.
Then read `docs/redesign/00-README.md`, `03-components.md` and `04-screens.md`. This phase changes components they
define.

---

## The problem being fixed

In the live v2 header, chips, the text input, Scan and Speak all share one wrapping flex row. As chips are added, the
**Speak button wraps onto a second line**, the field grows taller, and Scan (top right) and Speak (bottom left) end up
in different places. The text input also gets squeezed until there's almost nowhere to type.

Version B separates the two jobs:
- **The field is only for adding.** It holds the text input plus Speak and Scan. It never wraps and never changes height.
- **The chips live in a "Your kitchen" tray** under the header, where they can wrap (desktop) or scroll (mobile)
  without affecting the field.

## Ground rules

- **Audit before building.** Before changing anything, find and list (with paths): the current v2 `IngredientField`,
  `SiteHeaderV2`, `HaveChip`, `YourKitchenPopover`, the parsing and typo logic reused from `PantryInput`,
  `BarcodeScanner`, `VoiceInput`, the barcode lookup route (`src/app/api/barcode/route.ts`), the live region in
  `PantryAppV2`, and the shared hooks (`usePantry` etc.). **If the structure differs materially from what's described
  here, stop and report to David before building.**
- **Reuse behaviour, replace layout.** Parsing, typo matching (`src/lib/matching`), barcode detection
  (native BarcodeDetector + html5-qrcode fallback, Open Food Facts lookup) and Web Speech handling already exist.
  Don't rewrite them. Only their presentation changes.
- **Behind a flag.** Add `ingredientBarB` → `NEXT_PUBLIC_FEATURE_INGREDIENT_BAR_B`, default **false**, following the
  "Adding a flag" steps in `src/lib/flags.ts` (comment: `/** v2 ingredient bar, version B: input first + kitchen tray. */`).
  Update `.env.example` and `tests/flags.test.ts`. With the flag off, the current v2 bar renders unchanged.
- v2 tokens only, with no raw hex values. Lucide icons, no emoji. British English. No new `NEXT_PUBLIC_` secrets.

---

## 1. `IngredientField` (B variant)

New component `src/components/v2/IngredientFieldB.tsx`. Pick it in `SiteHeaderV2` and on the Home hero when the flag
is on.

**Structure (left to right):** search icon (decorative) → text input (`flex: 1; min-width: 0`) → 1px divider →
**Speak** → **Scan**.

| Rule | Value |
|---|---|
| Height | Fixed **52px** desktop, **56px** mobile. `flex-wrap: nowrap`. Nothing inside it may wrap. |
| Wrapper | `field` class (line-strong border, radius 14, focus ring on `:focus-within`), surface fill |
| Input | Visually hidden `<label>` "Add an ingredient"; placeholder "Add an ingredient, e.g. garlic" (mobile: "Add an ingredient"); 15px (16px on mobile, to stop iOS zooming) |
| Speak / Scan, ≥1024px | **Labelled** buttons: icon + "Speak" / "Scan", height 40, radius 10, `raised` fill, 14px/600 |
| Speak / Scan, <1024px | Icon-only buttons, 44×44, `aria-label="Speak"` / `aria-label="Scan a barcode"` |
| Chips | **None inside the field** (they move to the tray, §3) |
| Keys | Enter or comma adds; Esc closes suggestions; **Backspace on an empty field no longer removes a chip**, because chips are no longer next to the caret and a hidden deletion is easy to miss |

Speak is **feature-detected**. If the Web Speech API is unavailable (e.g. Firefox), don't render the button at all, rather than
showing a disabled one. Scan stays, because the typed-number fallback always works.

## 2. Suggestions and "Did you mean" (combobox)

Implement the **WAI-ARIA combobox pattern** on the input: `role="combobox"`, `aria-expanded`, `aria-controls` →
`role="listbox"`, `aria-activedescendant` for the highlighted `role="option"`. (The canvas draws options as buttons
for clarity; build the real pattern.)

- A panel opens under the field once ≥2 characters are typed: surface fill, line border, radius 14, shadow, 48px options.
- Bold the matched substring. The first option is highlighted by default (sprout fill, brand-strong text), with a mono
  "Enter to add" hint at the right of the highlighted row.
- Footer hint (mono 12px): "↑ ↓ to move · Enter to add · Esc to close".
- **Typo state** (no exact match; reuse the typo logic): a description line "We don't know “corgette” yet." (wired
  to the input with `aria-describedby`), then the highlighted option "Did you mean **courgette**?", then
  "Add “corgette” anyway".
  - Audit question: can the pantry hold an ingredient that doesn't map to the taxonomy? If not, **omit "Add anyway"**
    and say so in the PR. Don't invent a free-text path.

## 3. `KitchenTray`: the chips' new home

New component `src/components/v2/KitchenTray.tsx`, rendered directly under the header on the **Results** view only.
On Home with zero ingredients it isn't rendered.

**Desktop (≥768px):** a full-width strip (surface fill, line border top and bottom, padding 12×32):
- Left: `<h2>` "Your kitchen" with a fridge icon and a mono count badge (`9`).
- Middle: a `<ul aria-label="In your kitchen">` of `HaveChip`s that **wraps**. Cap it at **2 rows**; if more chips
  exist, the last visible item is a "Show all N" button (`aria-expanded`) that expands the tray in place.
- Right: "Clear all" (radish-text, ghost button).

**Mobile (<768px):** a header row with "Your kitchen · 9" and an **Edit** button (44px target). Below it, a **single row
that scrolls horizontally** (`overflow-x: auto`, `scroll-snap-type: x proximity`, scrollbar hidden, end-fade
mask). Edit opens the existing "Your kitchen" sheet or popover for bulk removal.

`YourKitchenPopover`'s "+N more" trigger in the header is **retired** when the flag is on. Keep the popover component,
because mobile Edit reuses its content.

Chips: `chip-have` fill, remove button ≥24px (28px on mobile) with `aria-label="Remove {name}"`. When a chip is
removed, move focus to the next chip, or to the field if none are left.

## 4. Scan

Reuse `BarcodeScanner` for detection and lookup. Only the shell changes. **Never auto-add a scanned item.**

**Desktop:** Scan toggles an anchored panel under the field (`role="dialog"`, `aria-label="Scan a barcode"`; the trigger
gets `aria-expanded` and the sprout "pressed" style).
- A camera viewport (about 150px tall, radius 12) with corner brackets, a guide line and the caption "Hold a barcode inside
  the frame".
- On a match, a result row (`role="status"`): "Found “Mature Cheddar 350g”" / **"Adds as Cheddar"**, with
  **Add Cheddar** (primary) and **Scan another** (secondary).
- A link-style button: "Type the barcode number instead", which swaps the viewport for a numeric input and runs the same
  lookup.
- Esc or clicking outside closes the panel, **stops the camera tracks** and returns focus to Scan.

**Mobile:** a full-screen `role="dialog"` on a dark camera background:
- Top bar: Close (`aria-label="Close scanner"`), the title "Scan a barcode", and a torch toggle (`aria-pressed`). Show the torch
  only if `track.getCapabilities().torch` is true.
- A bottom sheet with the result: **Add Cheddar** (primary, 52px), **"Not right? Search instead"** (prefills the field
  with the product name and closes the scanner), and "Added this session: Baked beans, Spaghetti".
- After Add, **stay in the scanner** so people can stock a pantry in one go. Close returns to the results.

**Error states (both sizes):** camera permission denied → "ForkChop needs camera access to scan. You can type the
number instead." plus the typed-number input; product not found → "We couldn't find that barcode." plus Search instead.

## 5. Speak

Reuse `VoiceInput` (Web Speech API). While listening, the **field itself switches into a listening state at the same
height**, rather than opening a separate overlay:
- A radish dot with a blush halo, the text "Listening…", and the interim transcript in text-2 (truncated with an ellipsis).
- Recognised ingredients appear as **sprout preview chips** (with a check icon and `×2` quantities) before anything is
  added.
- **Cancel** (secondary) and **Add N** (primary). Nothing joins the pantry until Add is pressed.
- Helper text under the field: "Say several at once, like “eggs, rice and an onion”."
- Permission denied or no speech detected: an inline message under the field, and the field returns to normal.

Split on "and", commas and pauses. Fold quantities into the `×N` badge; don't create duplicate chips.

## 6. Feedback and Undo

- A newly added chip gets a **2px brand ring for about 2 seconds** (respect `prefers-reduced-motion`: no fade, just
  remove the ring).
- An inline status message under the tray: "**Spinach added.** 22 recipes, 2 ready to cook." with an **Undo** button.
  It stays until the next pantry change or 8 seconds, whichever comes first. Undo also covers single removal and **Clear
  all**, which replaces any confirmation dialog.
- Announcements go through the **existing single polite live region** in `PantryAppV2` (04-screens §5, 400ms
  debounce). Don't add a second region.

## 7. Layout and breakpoints

| Width | Header | Field | Tray |
|---|---|---|---|
| ≥1024 | Logo · field (max 680px) · My Recipes · Log in · Menu | Labelled Speak/Scan | Wrapping strip, 2-row cap |
| 768–1023 | Same row; nav keeps text | Icon-only Speak/Scan | Wrapping strip, 2-row cap |
| <768 | Logo row, then the field at full width underneath | Icon-only, 44px | One row with horizontal scroll, plus Edit |

The header must **never wrap** at any width from 320px to 1920px. If space runs out, collapse "My Recipes" to an
icon (with an `aria-label`) before anything else moves.

## 8. Copy (British English, use verbatim)

"Add an ingredient, e.g. garlic" · "Add an ingredient" · "Speak" · "Scan" · "Scan a barcode" · "Your kitchen" ·
"Show all {N}" · "Clear all" · "Edit" · "We don't know “{term}” yet." · "Did you mean {suggestion}?" ·
"Add “{term}” anyway" · "Hold a barcode inside the frame" · "Found “{product}”" · "Adds as {ingredient}" ·
"Add {ingredient}" · "Scan another" · "Not right? Search instead" · "Type the barcode number instead" ·
"Added this session: {list}" · "Listening…" · "Say several at once, like “eggs, rice and an onion”." ·
"{Ingredient} added." · "{N} recipes, {M} ready to cook." · "Undo"

## 9. Tests

**Vitest (offline):**
- Tray overflow: the 2-row cap / "Show all N" count logic.
- Undo reducer: add → undo, remove → undo, clear all → undo restores order.
- Voice parsing: "two onions, some garlic and a tin of chopped tomatoes" → Onion ×2, Garlic, Chopped tomatoes.
- Combobox: the typo suggestion path returns "courgette" for "corgette".
- Flag off → the existing bar renders.

**Playwright (`tests/e2e/a11y.spec.ts`, all 4 projects):**
- **Regression for the wrap bug:** with 0, 5 and 24 ingredients, the field's bounding-box height is exactly
  52 (desktop) or 56 (mobile), and Speak and Scan share the same `y`.
- The combobox works by keyboard only: type, ↓, Enter adds, Esc closes, and focus stays in the input.
- The scan dialog: Esc closes it and focus returns to the Scan button.
- **Update the existing "24 ingredients: Your kitchen popover" test.** It clicks a `+N more` button that no longer
  exists when the flag is on. Point it at "Show all 24" (desktop) and Edit (mobile).
- Update the `FIELD` regex in the spec if the accessible name changes.
- axe: 0 violations with the suggestions open, the scan panel open and the listening state active.

## Acceptance checklist

- [ ] Audit summary in the PR description (component paths, and the "Add anyway" answer from §2).
- [ ] Flag off: header and results identical to `main`.
- [ ] Flag on: the field is a fixed height with 0–24+ ingredients; Speak and Scan never wrap or separate.
- [ ] Tray wraps (desktop, 2-row cap, Show all) and scrolls (mobile, Edit opens the sheet).
- [ ] Suggestions and "Did you mean" work by keyboard and with VoiceOver.
- [ ] Scan: match confirmation, Scan another, typed-number fallback, permission-denied state; camera stops on close.
- [ ] Speak: listening state at the same field height; preview chips; nothing is added until Add; hidden where unsupported.
- [ ] Add, remove and clear all show the status message with a working Undo; announced once via the existing live region.
- [ ] Every state checked in light and dark, at 1440, 1024, 768, 390 and 320px wide, and at 200% zoom.
- [ ] `npm run lint`, `npm test`, `npm run build` and `npm run test:e2e` pass.
- [ ] The PR lists the Vercel env var to add: **Preview only**, `NEXT_PUBLIC_FEATURE_INGREDIENT_BAR_B=true`, then
      redeploy. Production follows after David signs off on Preview.

## Out of scope

Filters, the results grid, the basket and the Kroger flow; the recipe catalog work (`catalog/*`); the A and C variants
on the canvas. After rollout, removing the old v2 bar and the flag follows the 06-rollout clean-up pattern.

Stop at the acceptance checklist and summarise for David: the audit findings, anything that didn't fit the plan, and
the Preview URL to review.
