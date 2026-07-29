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
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

/** Message shown in the sign-in panel when the project has not been wired up. */
export const SUPABASE_SETUP_HINT =
  'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable accounts.';
