import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { addToKrogerCart, exchangeCodeForUserToken, type KrogerCartLine } from '@/lib/grocery/kroger-api';
import { PENDING_COOKIE, STATE_COOKIE } from '@/lib/grocery/kroger-cookies';

export const dynamic = 'force-dynamic';

/**
 * Step 2: Kroger sends the shopper back here after they consent.
 *
 * Exchanges the authorization code for a per-user token, pushes the basket
 * into their Kroger cart, then drops them on kroger.com/cart.
 *
 * Every failure path still ends on Kroger with a `?cart=` marker rather than a
 * dead end, because by this point the shopper has already left ForkChop and
 * expects to land somewhere useful. The marker lets us be honest about whether
 * the basket actually made it.
 */

const KROGER_CART = 'https://www.kroger.com/cart';

type Outcome = 'added' | 'denied' | 'failed' | 'expired';

function finish(outcome: Outcome): NextResponse {
  const response = NextResponse.redirect(`${KROGER_CART}?forkchop=${outcome}`);
  // One-shot cookies — clear them however this turned out, so a stale basket
  // can never be replayed into someone's cart later.
  response.cookies.delete(STATE_COOKIE);
  response.cookies.delete(PENDING_COOKIE);
  return response;
}

/** Constant-time compare so the state token can't be probed byte by byte. */
function statesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function parsePending(raw: string | undefined): KrogerCartLine[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const lines = parsed
      .filter(
        (entry): entry is KrogerCartLine =>
          typeof entry?.upc === 'string' && Number.isInteger(entry?.quantity),
      )
      .map((entry) => ({ upc: entry.upc, quantity: entry.quantity }));
    return lines.length > 0 ? lines : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');

  // The shopper declined at Kroger's consent screen, or Kroger refused the
  // scope (cart.basic:write needs developer-portal approval).
  if (url.searchParams.get('error') || !code || !returnedState) {
    return finish('denied');
  }

  const cookies = request.headers.get('cookie') ?? '';
  const jar = new Map(
    cookies
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))] as const;
      }),
  );

  const expectedState = jar.get(STATE_COOKIE);
  if (!expectedState || !statesMatch(expectedState, returnedState)) {
    // Either a CSRF attempt or a flow that sat too long and lost its cookie.
    return finish('expired');
  }

  const lines = parsePending(jar.get(PENDING_COOKIE));
  if (!lines) return finish('expired');

  const token = await exchangeCodeForUserToken(code);
  if (!token) return finish('failed');

  const added = await addToKrogerCart(token, lines);
  return finish(added ? 'added' : 'failed');
}
