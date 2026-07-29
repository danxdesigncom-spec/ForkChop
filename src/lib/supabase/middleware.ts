import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from './config';

/**
 * Paths that require a signed-in user.
 *
 * Empty today: the pantry search must stay usable signed out, and "My Recipes"
 * is a view inside the single-page app rather than its own route, so it is
 * gated at the data layer instead. This exists so later phases can gate real
 * routes by adding a prefix here.
 */
const PROTECTED_PREFIXES: string[] = [];

/**
 * Refreshes the auth session on every request.
 *
 * Supabase access tokens are short-lived. Without this, a signed-in user's
 * session silently expires and Server Components start rendering them as signed
 * out. The cookie dance below is fiddly but load-bearing: the refreshed cookies
 * must be written onto the *same* response object that is returned, or the
 * browser never receives them.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  if (!isSupabaseConfigured()) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Do not remove: calling getUser() is what triggers the token refresh.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && PROTECTED_PREFIXES.some((prefix) => request.nextUrl.pathname.startsWith(prefix))) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/';
    redirectUrl.searchParams.set('signin', 'required');
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
