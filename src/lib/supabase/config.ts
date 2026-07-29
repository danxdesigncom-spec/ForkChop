/**
 * Supabase connection details.
 *
 * Both values are `NEXT_PUBLIC_` and therefore reach the browser — that is
 * correct and required. The anon key is a public identifier, not a secret: it
 * grants nothing on its own, because every table is protected by row-level
 * security keyed on `auth.uid()`. The key that *is* secret (service role) is
 * deliberately not used anywhere in this app.
 *
 * Auth is optional. With the variables unset the app runs exactly as it did
 * before — signed out, saving to localStorage — rather than crashing. That
 * matches how the grocery providers report `configured: false`, and it keeps
 * `npm run dev` working for anyone who clones the repo without a Supabase
 * project.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

/**
 * Supabase renamed this key.
 *
 * Newer projects issue a publishable key (`sb_publishable_...`); older ones
 * issue an anon JWT. They are interchangeable as far as supabase-js is
 * concerned, but the env var names differ between current and older docs, and
 * picking only one guarantees somebody wires up a project that silently reads
 * as "not configured". Both names are accepted, publishable first.
 *
 * Neither is a secret. They identify the project and are gated by row-level
 * security — which is why they are NEXT_PUBLIC_ and reach the browser. The key
 * that must never appear here is the secret/service-role one.
 */
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  '';

export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

/** Message shown in the sign-in panel when the project has not been wired up. */
export const SUPABASE_SETUP_HINT =
  'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to enable accounts.';
