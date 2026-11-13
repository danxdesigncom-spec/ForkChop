-- 0005_profile_theme.sql
-- ForkChop v2: remember each signed-in user's Appearance choice (System / Light / Dark).
-- Signed-out users keep the choice in the `fc-theme` cookie only.
--
-- profiles already exists (0001) with owner-only select + update policies, so no new
-- policies are needed: a user can only read and change their own theme.

alter table public.profiles
  add column if not exists theme text not null default 'system';

alter table public.profiles
  drop constraint if exists profiles_theme_check;

alter table public.profiles
  add constraint profiles_theme_check check (theme in ('system', 'light', 'dark'));

comment on column public.profiles.theme is
  'Appearance preference for the v2 UI: system | light | dark. Mirrors the fc-theme cookie.';
