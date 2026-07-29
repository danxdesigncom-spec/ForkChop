import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Where the magic link lands.
 *
 * Supabase redirects here with a one-time `code`, which we exchange for a
 * session. The exchange sets the auth cookies, so by the time we redirect the
 * user onward they are signed in.
 *
 * This URL must be registered in the Supabase dashboard under
 * Authentication → URL Configuration → Redirect URLs, for every origin the app
 * runs on (localhost, production, and preview deploys).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  // Supabase reports link problems (expired, already used) on the query string.
  const authError = searchParams.get('error_description') ?? searchParams.get('error');
  if (authError) {
    return NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent(authError)}`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent('Missing sign-in code')}`);
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent('Accounts are not configured')}`);
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent(error.message)}`);
  }

  /**
   * `next` comes from the URL, so treating it as a redirect target unchecked
   * would be an open redirect — an attacker could send a link that signs the
   * user in and then bounces them to a lookalike site. Only same-origin,
   * absolute-path values are allowed.
   */
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';

  return NextResponse.redirect(`${origin}${safeNext}?signed_in=1`);
}
