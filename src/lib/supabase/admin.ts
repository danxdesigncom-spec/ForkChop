import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from './config';

/**
 * Service-role Supabase client.
 *
 * Bypasses row-level security entirely, so it is used only inside the /admin
 * routes — where the caller has already been verified as an admin — and only
 * on the server. There is no path from a client component to this file.
 *
 * Returns null when SUPABASE_SERVICE_ROLE_KEY is not set: the admin UI can
 * still render, and the actions show a "not configured" message instead of
 * crashing. Same shape as the rest of the app's optional integrations.
 */

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export function isAdminSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SERVICE_ROLE_KEY.length > 0;
}

export function createAdminClient(): SupabaseClient | null {
  if (!isAdminSupabaseConfigured()) return null;

  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    // The service-role client is never on behalf of a signed-in user — no
    // cookies, no session persistence, no auto-refresh. Every call is a
    // one-shot elevated request from the admin backend.
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export const ADMIN_SUPABASE_SETUP_HINT =
  'Set SUPABASE_SERVICE_ROLE_KEY (server-only) to enable admin user management.';
