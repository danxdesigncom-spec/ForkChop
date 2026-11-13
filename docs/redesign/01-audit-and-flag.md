# Phase 1 — Audit, flag and switch (no visual change)

**Branch:** `redesign/01-flag` · **PR title:** `redesign: add v2 flag and brand switch`

You are working in the ForkChop repo (Next.js 16.2, React 19.2, Tailwind v4, Supabase, Vercel).
Read `AGENTS.md` first. This Next.js version has breaking changes, so check
`node_modules/next/dist/docs/` before using any Next API. Then read `docs/redesign/00-README.md`.

## Goal
Add the switch that lets v2 ship dark, then write an audit that maps the approved designs onto this
codebase. **No user-visible change when the flag is off.**

## Tasks

### 1. Feature flag
Follow the "Adding a flag" steps in `src/lib/flags.ts` exactly:
- Field `redesign: boolean` with the comment `/** v2 brand + layout (Chef Pig, Garden & Radish). */`
- Default **`false`** (this one soaks; don't copy the all-`true` defaults).
- Env var `NEXT_PUBLIC_FEATURE_REDESIGN`, documented in `.env.example` and in the deploy notes.
- Extend `tests/flags.test.ts` to cover the new flag (default false; the env var overrides it).

### 2. Brand attribute on `<html>`
In `src/app/layout.tsx`, read `getFlags()` server-side. When `redesign` is on, set
`data-brand="v2"` on `<html>` and change `lang="en"` to `lang="en-GB"`. When it's off, leave `<html>`
unchanged. Don't add tokens yet.

### 3. v2 entry point (empty shell)
- Create `src/components/v2/PantryAppV2.tsx` that takes the **same props** as `PantryApp` and, for
  now, renders `<PantryApp {...props} />`, so Preview behaves identically.
- In `src/app/page.tsx`, render `PantryAppV2` when `flags.redesign`, otherwise `PantryApp`.

### 4. Audit report → `docs/redesign/AUDIT.md`
Produce a written audit (no code changes) covering:
1. **Component map**: each v1 component (`PantryApp`, `SiteHeader`, `PantryInput`, `FilterSection`,
   `FilterBar`, `ChipFilter`, `AllergyFilter`, `DislikesInput`, `StatsRow`, `RecipeCard`,
   `MatchRing`, `BasketPanel`, `StorePicker`, `InfiniteScrollSentinel`, `PigMascot`, `HamburgerMenu`,
   `AccountMenu`, `SignInPanel`, `RecipeDetail`, `ContentPageHeader`) → its v2 replacement (see
   `03-components.md`) → reuse, restyle or rebuild.
2. **State and logic to share**: list what in `PantryApp.tsx` is logic (fetching, pantry store,
   matching, basket, ratings, sync) versus layout. Propose extracting the logic into hooks
   (`usePantry`, `useRecommendations`, `useBasket`) that both v1 and v2 can call. **Don't extract
   yet**; just list it.
3. **Emoji inventory**: every emoji rendered in UI components (there are about 50 across 16
   components; `taxonomy.ts`, `allergens.ts`, `departments.ts` and recipe data hold more) and the
   Lucide icon replacing each.
4. **Token usage**: confirm that every colour flows through the CSS variables in `globals.css` (the
   only hard-coded hexes should be in `opengraph-image.tsx`). Flag any inline `style={{ color: … }}`
   that uses `SCORE_COLOR` or `CATEGORY_COLOR` from `src/lib/theme.ts`.
5. **Risks and unknowns**: anything that blocks phases 2–4. Include the three open decisions in the
   README (photos, category colours, page size) with your recommendation.

## Acceptance checklist
- [ ] `npm run lint`, `npm test` and `npm run build` pass.
- [ ] With the flag unset, the rendered HTML is identical to `main` (apart from nothing).
- [ ] With `NEXT_PUBLIC_FEATURE_REDESIGN=true` locally, `<html data-brand="v2" lang="en-GB">` is present
      and the app still looks like v1.
- [ ] `docs/redesign/AUDIT.md` is committed and answers all 5 sections.
- [ ] PR description lists the Vercel env var to add: **Preview only**, `NEXT_PUBLIC_FEATURE_REDESIGN=true`.

Stop here and summarise the audit's key findings for David before starting phase 2.
