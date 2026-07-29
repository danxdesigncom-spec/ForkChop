-- ForkChop — Phase 2: saving recipes that come from external sources.
--
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Idempotent, so re-running is safe. Requires 0001 to have run first.

-- Phase 1 stored a slug that pointed into the bundled corpus. External recipes
-- have no entry there, so two columns are added:
--
--   source_id — which catalogue the slug belongs to ('local', 'spoonacular')
--   snapshot  — the full recipe as it was when saved
--
-- Snapshotting matters. Without it, opening My Recipes would re-fetch every
-- saved external recipe, which burns API quota on every page view and leaves
-- the page broken whenever the provider is down or the daily allowance is
-- spent. A saved recipe should stay readable forever.

alter table public.saved_recipes
  add column if not exists source_id text not null default 'local';

alter table public.saved_recipes
  add column if not exists snapshot jsonb;

comment on column public.saved_recipes.source_id is
  'Catalogue the recipe_slug belongs to: local, spoonacular, ...';
comment on column public.saved_recipes.snapshot is
  'Full recipe as saved. Null for local recipes, which are read from the bundled corpus.';

-- Local recipes need no snapshot; external ones are useless without one.
alter table public.saved_recipes
  drop constraint if exists saved_recipes_snapshot_required;

alter table public.saved_recipes
  add constraint saved_recipes_snapshot_required
  check (source_id = 'local' or snapshot is not null);

create index if not exists saved_recipes_source_idx
  on public.saved_recipes (user_id, source_id);

-- Row-level security is inherited from 0001: the policies key on user_id, which
-- is unchanged, so the new columns are covered without further work.
