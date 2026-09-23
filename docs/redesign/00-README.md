# ForkChop v2 redesign — implementation pack

**Design source of truth:** the ForkChop Redesign canvas → *Final designs* page
(https://claude.ai/artifact/GKsrLGw9R6iuW7UfRYhaWd). Brand: Chef Pig + Garden & Radish, light and dark.
**Decision log:** `claude/brand-redesign.md` in the ForkChop project.

This pack turns the approved designs into a sequence of Claude Code sessions. Each phase is one
branch, one PR, one Vercel Preview. Nothing reaches production until you flip one env var.

---

## How to use it

1. Copy this `redesign/` folder into the repo at `docs/redesign/` (commit it on the first branch).
2. For each phase, start a fresh Claude Code session in the repo and say:
   > Read `docs/redesign/0X-….md` and carry it out. Stop at the acceptance checklist and report.
3. Review the Preview deployment, merge the PR, move to the next phase.

Every prompt starts by re-reading `AGENTS.md`: this repo runs **Next.js 16.2 / React 19.2**, and
AGENTS.md warns the APIs differ from training data. Check `node_modules/next/dist/docs/` before
using any Next API.

## Phases

| # | File | Branch | What ships | Visible in prod? |
|---|---|---|---|---|
| 1 | `01-audit-and-flag.md` | `redesign/01-flag` | `redesign` flag, `data-brand` switch, audit report | No |
| 2 | `02-foundations.md` | `redesign/02-foundations` | v2 tokens (light and dark), Fraunces, focus ring, theme switch, Chef Pig, icons, Supabase migration 0005 | No (flag off) |
| 3 | `03-components.md` | `redesign/03-components` | v2 component set in `src/components/v2/` | No |
| 4 | `04-screens.md` | `redesign/04-screens` | v2 Home, Results (page numbers), Basket (+ Kroger `modality` fix), all empty and long states | No |
| 5 | `05-a11y-qa.md` | `redesign/05-a11y` | Playwright + axe suite in CI, both themes | No |
| 6 | `06-rollout.md` | `redesign/06-cleanup` | Flag on in Production, then remove v1 | **Yes** |

## Architecture decisions (already made)

- **One flag:** `redesign` → `NEXT_PUBLIC_FEATURE_REDESIGN`, default `false`, following the existing
  `src/lib/flags.ts` pattern. Enable it in **Preview only** until phase 6.
- **Tokens by attribute, not by fork.** The root layout sets `<html data-brand="v2">` when the flag is
  on. `assets/tokens-v2.css` redefines the *existing* variable names (`--background`, `--brand`,
  `--score-high`…) under that attribute, so every current `bg-surface` / `text-brand` utility
  re-skins itself. New tokens (`--line-strong`, `--on-brand`, `--radish`…) are added alongside.
  With the flag off, v1 renders exactly as it does today.
- **Structure in a parallel folder.** New layouts live in `src/components/v2/`. `page.tsx` renders
  `PantryAppV2` when the flag is on, otherwise today's `PantryApp`. That avoids `if (flags.redesign)`
  branches throughout the 962-line `PantryApp.tsx`. Hooks, the pantry store, matching, the grocery
  providers and the API routes are shared; do not duplicate them.
- **Theme:** System / Light / Dark. The choice is stored in a `fc-theme` cookie, so the server
  renders the right `data-theme` with no flash, and mirrored to `profiles.theme` when signed in
  (migration 0005). `prefers-color-scheme` is the fallback.
- **Page numbers replace infinite scroll** in v2: `?page=N` in the URL, 6 per page on desktop and 8 on
  mobile as designed. Section order (Ready → Almost → Stretch) is preserved across pages.
- **Icons:** `lucide-react`. Emoji leave the UI; emoji in *data* (taxonomy, recipes) stay in the
  database for now but are no longer rendered in v2.

## Open decisions (Claude Code will ask; defaults in bold)

1. **Recipe photos for local seed recipes.** The 60 SQLite recipes have emoji, not photos. v2 cards
   need an image area. **Default: a tinted panel with a Lucide category icon, and a small chef as
   a fallback.** Spoonacular recipes use `image_url`. Longer term, your own food photography for
   the seed set would be a strong upgrade.
2. **Ingredient category colours** (`--cat-*`). The v2 designs don't use them. **Default: keep the tokens,
   and show category only as a small dot on chips in the "Your kitchen" popover.**
3. **Page size.** **Default: as designed (desktop 6, mobile 8).** Alternative: 12 everywhere, so
   `?page=2` shows the same items on every device.

## Assets in this pack

| File | Goes to | Purpose |
|---|---|---|
| `assets/tokens-v2.css` | `src/app/tokens-v2.css` (imported after `globals.css`) | Every v2 colour, light and dark, plus the focus ring and field rules |
| `assets/ChefPig.tsx` | `src/components/v2/ChefPig.tsx` | Mascot and logo; 5 expressions; full and solid variants; theme-aware |
| `assets/icon.svg` | `src/app/icon.svg` (phase 6 — see note) | Favicon / app icon (solid chef on a forest tile) |
| `assets/apple-icon.png` | `src/app/apple-icon.png` (phase 6) | 180×180 home-screen icon |
| `assets/0005_profile_theme.sql` | `supabase/migrations/` | `profiles.theme` preference column |
| `assets/a11y.spec.ts` | `tests/e2e/a11y.spec.ts` | Playwright + axe suite, both themes and both viewports |
| `assets/a11y.yml` | `.github/workflows/a11y.yml` | Runs the suite on every PR |

## Guardrails (from your ways of working)

- Audit before building: phase 1 produces an audit and plan before any UI code.
- Server-side secrets only; nothing new goes in `NEXT_PUBLIC_` except the flag.
- British English in all copy.
- Env var changes need a redeploy on Vercel. Preview URLs with hashes sit behind Deployment
  Protection, so review on the branch Preview URL while signed in to Vercel.
- The Kroger `modality` fix lands in phase 4, driven by the new Pickup / Delivery toggle.
