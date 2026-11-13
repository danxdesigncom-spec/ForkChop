# Phase 2 — Foundations: tokens, type, focus, theme, Chef Pig

**Branch:** `redesign/02-foundations` · **PR title:** `redesign: v2 tokens, theme switch and Chef Pig`

Read `AGENTS.md` (check the Next 16 docs before using any Next API), `docs/redesign/00-README.md` and
`docs/redesign/AUDIT.md`. Every change here must be invisible when the `redesign` flag is off.

## 1. Tokens
- Copy `docs/redesign/assets/tokens-v2.css` to `src/app/tokens-v2.css` and import it in
  `layout.tsx` **after** `globals.css`. Every rule in it is scoped to `html[data-brand="v2"]`, so
  v1 is untouched.
- Extend the `@theme inline` block in `globals.css` so Tailwind generates utilities for the new
  tokens: `line-strong`, `on-brand`, `raised`, `selected`, `radish`, `blush`, `saffron`,
  `saffron-soft`, `saffron-text`, `chip-have`, `chip-have-fg`, `placeholder`, and
  `--font-display: var(--font-fraunces)`.
  (Utilities resolve at runtime, so v1 values apply when the attribute is absent.)
- Update `src/lib/theme.ts` → `scoreBand` labels are unchanged; `SCORE_COLOR` keeps pointing at the
  same variables (v2 redefines them). The `low` band becomes neutral grey in v2; that's intended,
  since a low match isn't an error.

## 2. Typography
- Add **Fraunces** via `next/font/google` (weights 600; optical sizing on) as `--font-fraunces`.
  Load it only when the flag is on, if the Next 16 font API allows conditional use; otherwise load
  it always and apply it only under `data-brand="v2"`.
- Geist and Geist Mono stay.

## 3. Focus ring (WCAG 2.4.7; this is audit v2's serious finding)
`tokens-v2.css` already defines the ring as `--focus-ring` and applies it to `:focus-visible`, plus
text-field wrappers via `:focus-within`. In v2 components, **never** put `outline-none` on an
input unless its wrapper carries the `field` class. Check that the v1 focus rule in `globals.css`
doesn't fight the v2 one under `data-brand="v2"`.

## 4. Theme switch: System / Light / Dark
- Cookie `fc-theme` = `system | light | dark` (1 year, `SameSite=Lax`, not HttpOnly, because the
  client writes it).
- In `layout.tsx`, read the cookie with the Next 16 cookies API and set `data-theme="light|dark"` on
  `<html>` when it's not `system`, so the server renders the right theme on first paint (no flash).
  `system` → omit the attribute; the CSS falls back to `prefers-color-scheme`.
- Add `color-scheme` handling (already in `tokens-v2.css`).
- Client hook `useTheme()` in `src/lib/v2/theme-preference.ts`: read and write the cookie, update
  `document.documentElement.dataset.theme` immediately, and when signed in, `update` the
  user's row in `profiles`, setting `theme` (the row already exists; migration 0001 has owner-only
  select and update policies, so don't add an insert path).
- Migration: copy `docs/redesign/assets/0005_profile_theme.sql` into `supabase/migrations/`. Apply it
  with `supabase link` then `supabase db push`, **after** review. RLS must remain owner-only.
- UI: a three-way segmented control, "Appearance: System / Light / Dark", inside the v2 menu (built in
  phase 3; expose the hook now).

## 5. Chef Pig and icons
- Copy `docs/redesign/assets/ChefPig.tsx` to `src/components/v2/ChefPig.tsx`. It supports
  `expression` (`default | happy | wink | thinking | oops`), `variant` (`full | solid`) and `size`,
  and is decorative by default (`aria-hidden`). It adapts to dark via CSS variables in
  `tokens-v2.css`.
- `npm i lucide-react`. Don't import the whole library; use named imports.
- App icons: **don't** replace `src/app/favicon.ico` yet. Icons can't be flag-gated, so they swap in
  phase 6. Stage the files at `docs/redesign/assets/` only.

## 6. Hide v1-only decoration under v2
`globals.css` draws a pink polka texture on `body::before`, and `.brand-scrollbar` is pink.
`tokens-v2.css` neutralises both under `data-brand="v2"`; confirm this visually.

## Acceptance checklist
- [ ] Flag off: pixel-identical to `main` (spot-check Home, Results, Basket, `/about`).
- [ ] Flag on: the whole app re-skins to Garden & Radish (still with the v1 layout). That's expected
      at this phase, and a good early look.
- [ ] Flag on, dark: `fc-theme=dark` renders dark on first paint with no flash; `system` follows the OS.
- [ ] Tab through the page: every control shows the forest ring (mint in dark) with a 2px gap.
- [ ] `ChefPig` renders all 5 expressions in both themes (add a temporary `/dev/chef` route if useful,
      and delete it before merging).
- [ ] Migration 0005 reviewed; `profiles.theme` has a check constraint and owner-only RLS.
- [ ] lint, test and build pass.
