# Phase 6 — Rollout and clean-up

**Branch:** `redesign/06-cleanup` (steps 3 onwards) · Steps 1–2 are Vercel settings only.

## 1. Preview sign-off (David)
- [ ] Walk every canvas state on the branch Preview URL, in light and dark, on a phone and on a desktop.
- [ ] A real Kroger cart hand-off works (Pickup and Delivery).
- [ ] The a11y workflow is green.

## 2. Turn it on in Production
- Vercel → Project → Settings → Environment Variables → add `NEXT_PUBLIC_FEATURE_REDESIGN=true` for
  **Production** → **Redeploy** (env vars are only read at build time).
- Smoke test on https://fork-chop.vercel.app. **Rollback** = set it to `false` and redeploy. There's
  no code revert, and v1 is still in the codebase.
- Let it soak for about a week.

## 3. Swap non-flaggable assets (after the soak)
These can't be gated, so they change once v2 is permanent:
- Copy `docs/redesign/assets/icon.svg` → `src/app/icon.svg` and `apple-icon.png` → `src/app/apple-icon.png`.
  Remove `src/app/favicon.ico`, or regenerate it from `icon.svg`.
- Rebuild `opengraph-image.tsx` and `twitter-image.tsx` in the v2 palette: oat background, Chef Pig, and
  "Cook what you already have." in Fraunces. It's the only file with hard-coded hexes.
- Add `themeColor` to the metadata/viewport export: `#F7F4EC` light and `#121714` dark.

## 4. Remove v1
- Flip the `redesign` default to `true`, then remove the flag entirely one release later, following the
  flags.ts conventions.
- Delete the v1-only components listed in `AUDIT.md` (`PantryApp` layout, `FilterSection`, `StatsRow`,
  `InfiniteScrollSentinel`, `PigMascot`, v1 `RecipeCard`/`MatchRing`, and so on). Keep the shared
  hooks.
- Promote `tokens-v2.css` into `globals.css`: move the `html[data-brand="v2"]` values to `:root` and
  delete the pink v1 tokens, the polka texture and the pink scrollbar.
- Remove `data-brand` from the layout. Remove the `pagination` (infinite scroll) flag if nothing
  else uses it.
- Delete the `/dev/*` routes.
- Update the README screenshots.

## Acceptance checklist
- [ ] Production runs v2 with no flag dependency.
- [ ] No references to deleted components (`tsc` + lint clean).
- [ ] The a11y suite is still green.
- [ ] `claude/brand-redesign.md` in the ForkChop project is updated to "Shipped".
