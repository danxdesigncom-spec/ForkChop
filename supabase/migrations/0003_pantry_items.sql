-- ForkChop — Phase 3: a pantry that follows the user between devices.
--
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Idempotent. Requires 0001.

-- Shape follows the app's existing item model (BasketItem / ShoppingListItem in
-- src/lib), which pairs a canonical `ingredientId` with a display `name`. Doing
-- anything different here would mean two vocabularies for the same concept.
--
-- Two columns rather than one, because they answer different questions:
--
--   raw_text      what the user typed, said or scanned. The chips render this,
--                 so "2 chicken breasts" stays "2 chicken breasts".
--   ingredient_id what it resolved to, or NULL when nothing matched. Nullable
--                 on purpose — an unrecognised entry is still worth keeping and
--                 showing, exactly as the localStorage pantry does today.
create table if not exists public.pantry_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  raw_text      text not null check (char_length(raw_text) between 1 and 200),
  ingredient_id text,
  -- How it got here, so later phases can show scan history or undo a bad scan.
  source        text not null default 'typed'
                check (source in ('typed', 'scanned', 'voice')),
  -- Only set for scans; lets a mis-scan be traced back to the packet.
  barcode       text check (barcode is null or barcode ~ '^[0-9]{8,14}$'),
  created_at    timestamptz not null default now()
);

comment on table public.pantry_items is
  'A signed-in user''s kitchen. Mirrors the localStorage pantry used when signed out.';

-- Case-insensitive uniqueness: adding "Chicken breast" when "chicken breast" is
-- already there should be a no-op, matching how the client de-duplicates.
create unique index if not exists pantry_items_user_text_idx
  on public.pantry_items (user_id, lower(raw_text));

create index if not exists pantry_items_user_created_idx
  on public.pantry_items (user_id, created_at desc);

alter table public.pantry_items enable row level security;

-- Four explicit policies, matching 0001: one "for all" would make a mistake in
-- a single verb silently widen the others.
drop policy if exists "Pantry items are viewable by their owner" on public.pantry_items;
create policy "Pantry items are viewable by their owner"
  on public.pantry_items for select
  using (auth.uid() = user_id);

drop policy if exists "Pantry items are insertable by their owner" on public.pantry_items;
create policy "Pantry items are insertable by their owner"
  on public.pantry_items for insert
  with check (auth.uid() = user_id);

drop policy if exists "Pantry items are updatable by their owner" on public.pantry_items;
create policy "Pantry items are updatable by their owner"
  on public.pantry_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Pantry items are deletable by their owner" on public.pantry_items;
create policy "Pantry items are deletable by their owner"
  on public.pantry_items for delete
  using (auth.uid() = user_id);
