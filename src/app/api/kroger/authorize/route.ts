import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import {
  AUTHORIZE_URL,
  CART_SCOPE,
  isKrogerCartConfigured,
  krogerRedirectUri,
} from '@/lib/grocery/kroger-api';
import { getFlags } from '@/lib/flags';
import {
  COOKIE_MAX_AGE_SECONDS,
  PENDING_COOKIE,
  STATE_COOKIE,
} from '@/lib/grocery/kroger-cookies';
import { KrogerHandoffSchema, toCartLines } from '@/lib/grocery/kroger-cart';

export const dynamic = 'force-dynamic';

/**
 * Step 1 of pushing a basket into the shopper's real Kroger cart.
 *
 * Called as POST rather than a plain link because the basket has to travel
 * with the request. The UPCs are stashed in an httpOnly cookie and the client
 * is handed back Kroger's consent URL to navigate to — the basket itself never
 * goes through the query string, where it would land in logs and history.
 *
 * The body may carry `modality` (PICKUP or DELIVERY, default PICKUP). Every
 * line is stamped with it, because Kroger drops lines with no fulfilment type.
 *
 * The `state` parameter is a CSRF token: generated here, mirrored into a
 * cookie, and required to match on the way back in /api/kroger/callback.
 */


export async function POST(request: Request) {
  if (!getFlags().kroger) {
    return NextResponse.json({ error: 'Kroger checkout is disabled.' }, { status: 404 });
  }
  if (!isKrogerCartConfigured()) {
    return NextResponse.json(
      { error: 'Kroger cart handoff is not configured on this deployment.' },
      { status: 409 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = KrogerHandoffSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 },
    );
  }

  const state = randomBytes(16).toString('hex');

  const authorizeUrl = `${AUTHORIZE_URL}?${new URLSearchParams({
    scope: CART_SCOPE,
    client_id: process.env.KROGER_CLIENT_ID?.trim() ?? '',
    redirect_uri: krogerRedirectUri(),
    response_type: 'code',
    state,
  })}`;

  const response = NextResponse.json({ authorizeUrl });

  /*
   * sameSite 'lax' rather than 'strict': the callback arrives as a top-level
   * navigation from kroger.com, and a strict cookie would not be sent with it,
   * breaking the flow at the last step.
   */
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  };

  response.cookies.set(STATE_COOKIE, state, cookieOptions);
  response.cookies.set(PENDING_COOKIE, JSON.stringify(toCartLines(parsed.data)), cookieOptions);

  return response;
}
