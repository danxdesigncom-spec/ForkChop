'use client';

import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from './config';

/**
 * Supabase client for browser code.
 *
 * `createBrowserClient` from @supabase/ssr stores the session in cookies rather
 * than localStorage, which is what lets the server read it too. The deprecated
 * `@supabase/auth-helpers-nextjs` package is deliberately not used.
 *
 * Returns null when Supabase is not configured, so callers degrade to the
 * signed-out experience instead of throwing on module load.
 */
export function createClient() {
  if (!isSupabaseConfigured()) return null;
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
