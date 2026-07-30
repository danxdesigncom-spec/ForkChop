/**
 * Where to send people back to after a magic-link sign-in.
 *
 * Preference order:
 *   1. NEXT_PUBLIC_SITE_URL — the pinned canonical origin
 *   2. Origin / X-Forwarded-Host / Host of the current request
 *
 * The pinned option is what you want in every hosted environment. Without
 * it, Vercel preview deploys and localhost both work — the request origin
 * *is* the preview URL — but the email link opens *that same preview URL*
 * from a fresh browser (the user's phone), which has no Vercel bypass
 * cookie and hits the "Log in with Vercel" wall before reaching ForkChop.
 *
 * Setting the env var in Production to the canonical public domain fixes
 * it: every magic link points there, whatever URL the user signed up from.
 *
 * A trailing slash on the env var is tolerated so nobody has to remember.
 */

export interface RequestHeaders {
  get(name: string): string | null;
}

export function resolveSiteOrigin(headers: RequestHeaders): string {
  const pinned = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (pinned) return pinned.replace(/\/+$/, '');

  const origin = headers.get('origin');
  if (origin) return origin;

  const host = headers.get('x-forwarded-host') ?? headers.get('host');
  if (!host) return '';

  const protocol =
    headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${protocol}://${host}`;
}
