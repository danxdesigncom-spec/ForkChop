import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { User } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from './config';

/**
 * Supabase client for Server Components, Route Handlers and Server Actions.
 *
 * Must be created per request — the cookie store is request-scoped, so a shared
 * module-level client would leak one user's session into another's request.
 */
export async function createClient() {
  if (!isSupabaseConfigured()) return null;

  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. That is fine: middleware
          // refreshes the session on every request, so the write here is only
          // ever a redundant refresh.
        }
      },
    },
  });
}

/**
 * The signed-in user, or null.
 *
 * Always uses `getUser()` rather than `getSession()`. `getSession()` trusts the
 * cookie as-is; `getUser()` revalidates it against the Supabase auth server, so
 * a forged or stale cookie cannot fabricate a user server-side.
 */
export async function getUser(): Promise<User | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ?? null;
}

export class UnauthorizedError extends Error {
  constructor() {
    super('You must be signed in to do that.');
    this.name = 'UnauthorizedError';
  }
}

/**
 * Route-handler guard. Throws `UnauthorizedError`, which callers translate to a
 * 401 — the mechanism later phases use to gate saved pantries and scans.
 */
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) throw new UnauthorizedError();
  return user;
}
