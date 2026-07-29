-- ForkChop — Phase 1: accounts and account-backed saved recipes.
--
-- Run this once in the Supabase dashboard: SQL Editor → New query → paste →
-- Run. It is written to be idempotent, so re-running it is safe.
--
-- Every table here is protected by row-level security. That is what makes it
-- safe to ship the anon key to the browser: the key identifies the project, and
-- the policies below decide what the signed-in user may actually touch.

-- ---------------------------------------------------------------- profiles

-- Minimal on purpose; later phases extend it (saved pantries, scan history).
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per auth user. Extended in later phases.';

alter table public.profiles enable row level security;

drop policy if exists "Profiles are viewable by their owner" on public.profiles;
create policy "Profiles are viewable by their owner"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Profiles are updatable by their owner" on public.profiles;
create policy "Profiles are updatable by their owner"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------------------------------------------------------- saved recipes

-- Recipe slugs, not ids: slugs are the stable public identifier used by the
-- app's URLs and API, and the recipe corpus itself lives outside Postgres.
create table if not exists public.saved_recipes (
  user_id     uuid not null references auth.users (id) on delete cascade,
  recipe_slug text not null check (char_length(recipe_slug) between 1 and 128),
  created_at  timestamptz not null default now(),
  primary key (user_id, recipe_slug)
);

comment on table public.saved_recipes is 'Recipes a user has hearted. Slug references the bundled recipe corpus.';

create index if not exists saved_recipes_user_idx
  on public.saved_recipes (user_id, created_at desc);

alter table public.saved_recipes enable row level security;

-- Four explicit policies rather than one "for all": it makes the intent
-- auditable, and means a mistake in one verb cannot silently widen the others.
drop policy if exists "Saved recipes are viewable by their owner" on public.saved_recipes;
create policy "Saved recipes are viewable by their owner"
  on public.saved_recipes for select
  using (auth.uid() = user_id);

drop policy if exists "Saved recipes are insertable by their owner" on public.saved_recipes;
create policy "Saved recipes are insertable by their owner"
  on public.saved_recipes for insert
  with check (auth.uid() = user_id);

drop policy if exists "Saved recipes are deletable by their owner" on public.saved_recipes;
create policy "Saved recipes are deletable by their owner"
  on public.saved_recipes for delete
  using (auth.uid() = user_id);

drop policy if exists "Saved recipes are updatable by their owner" on public.saved_recipes;
create policy "Saved recipes are updatable by their owner"
  on public.saved_recipes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------- profile auto-creation

-- Creating the profile from a trigger rather than from application code means
-- it cannot be skipped — including for users created via the dashboard or a
-- future OAuth provider.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill anyone who signed up before this migration ran.
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;
