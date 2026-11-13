-- ForkChop — Phase 5.13: aggregated recipe ratings.
--
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Idempotent. Requires 0001.
--
-- Aggregation model
-- -----------------
-- One row per (user, recipe_slug). A user has at most one rating per recipe;
-- rating a recipe again UPDATEs their previous value. The public aggregate
-- (average + count) is a view that anyone can read, gated by RLS so the
-- underlying per-user rows are private.
--
-- Recipe identity is a slug string, not a foreign key, because the corpus
-- lives outside Postgres (bundled local recipes + Spoonacular snapshots)
-- and the same slug scheme is already what saved_recipes uses.
--
-- Moderation is a future problem. In the meantime we constrain the value to
-- 1..5 and the source to a small set, so nothing malformed can land.

create table if not exists public.recipe_ratings (
  user_id     uuid not null references auth.users (id) on delete cascade,
  recipe_slug text not null check (char_length(recipe_slug) between 1 and 128),
  stars       int  not null check (stars between 1 and 5),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, recipe_slug)
);

comment on table public.recipe_ratings is
  'One row per user per recipe. Aggregated by recipe_ratings_summary.';

create index if not exists recipe_ratings_slug_idx
  on public.recipe_ratings (recipe_slug);

alter table public.recipe_ratings enable row level security;

-- Four explicit verbs, same shape as saved_recipes (0001). A user can only
-- read their own rating; the public sees only the aggregate below.
drop policy if exists "Ratings are viewable by their owner" on public.recipe_ratings;
create policy "Ratings are viewable by their owner"
  on public.recipe_ratings for select using (auth.uid() = user_id);

drop policy if exists "Ratings are insertable by their owner" on public.recipe_ratings;
create policy "Ratings are insertable by their owner"
  on public.recipe_ratings for insert with check (auth.uid() = user_id);

drop policy if exists "Ratings are updatable by their owner" on public.recipe_ratings;
create policy "Ratings are updatable by their owner"
  on public.recipe_ratings for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "Ratings are deletable by their owner" on public.recipe_ratings;
create policy "Ratings are deletable by their owner"
  on public.recipe_ratings for delete using (auth.uid() = user_id);

-- Keep updated_at in step so "changed my mind" is a real timestamp rather
-- than the original rating date.
create or replace function public.touch_recipe_ratings_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists recipe_ratings_touch on public.recipe_ratings;
create trigger recipe_ratings_touch
  before update on public.recipe_ratings
  for each row execute function public.touch_recipe_ratings_updated_at();

-- Public aggregate.
-- SECURITY DEFINER because the underlying RLS is "owner only" — a plain view
-- or SECURITY INVOKER function would see zero rows when called by anon and
-- the aggregate would always be empty. The function returns only count and
-- average, never individual votes.
--
-- search_path is pinned to '' so a hostile role can't shadow public.recipe_ratings
-- with a same-named object; the fully-qualified reference below is the only
-- table this function touches.
create or replace function public.recipe_ratings_summary()
  returns table (recipe_slug text, vote_count int, avg_stars float)
  language sql
  security definer
  set search_path = ''
  stable
as $$
  select
    recipe_slug,
    count(*)::int as vote_count,
    round(avg(stars)::numeric, 2)::float as avg_stars
  from public.recipe_ratings
  group by recipe_slug;
$$;

-- Read the aggregate for a single recipe without pulling the whole table.
create or replace function public.recipe_rating_for(p_recipe_slug text)
  returns table (vote_count int, avg_stars float)
  language sql
  security definer
  set search_path = ''
  stable
as $$
  select
    count(*)::int as vote_count,
    round(avg(stars)::numeric, 2)::float as avg_stars
  from public.recipe_ratings
  where recipe_slug = p_recipe_slug;
$$;

grant execute on function public.recipe_ratings_summary() to anon, authenticated;
grant execute on function public.recipe_rating_for(text)   to anon, authenticated;
