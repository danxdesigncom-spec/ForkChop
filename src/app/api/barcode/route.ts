import { NextResponse } from 'next/server';
import { getLexicon } from '@/lib/matching/lexicon';
import { resolveIngredient } from '@/lib/matching/normalize';
import type { ResolutionMethod } from '@/lib/types';
import { getCached, setCached, takeToken } from '@/lib/barcode/off-throttle';

export const dynamic = 'force-dynamic';

/**
 * GET /api/barcode?code=5000159484695
 *
 * Turns a scanned barcode into a catalog ingredient.
 *
 * The lookup runs server-side against Open Food Facts, a free public product
 * database — so a barcode leaves this machine, but nothing else does: no user
 * identifier, no pantry contents, no cookies.
 *
 * Resolution reuses the pantry normalizer, but with two constraints that do not
 * apply to typed input:
 *
 * 1. Category tags are tried first. `en:canned-tomatoes` is clean taxonomy;
 *    "Beanz in a rich tomato sauce" is marketing copy.
 * 2. Only high-confidence methods are accepted. Partial and fuzzy matching are
 *    right for a human typing "chiken breast", but on a marketing name they are
 *    a coin flip — that Heinz baked beans product resolved to fresh *tomato*
 *    purely because the phrase contains the word. Better to return nothing and
 *    let the user add the product by name.
 */

const OFF_ENDPOINT = 'https://world.openfoodfacts.org/api/v2/product';

/**
 * Open Food Facts requires a custom User-Agent identifying the app, in the
 * form AppName/Version (contact). This is also the reason the lookup is
 * proxied rather than called from the browser: User-Agent is a forbidden
 * header, so client-side fetch physically cannot comply.
 *
 * The trade is that every user shares this server's IP against OFF's
 * 15 requests/minute/IP limit — hence the cache and throttle below.
 */
const OFF_USER_AGENT = 'ForkChop/0.3 (https://fork-chop.vercel.app)';
const FIELDS =
  'product_name,product_name_en,generic_name,brands,categories_tags,quantity,image_front_small_url,image_url';

/**
 * Resolution methods trustworthy enough to auto-fill a pantry from a package
 * label. `partial` and `fuzzy` are deliberately excluded — see the note above.
 */
const ACCEPTED_METHODS = new Set<ResolutionMethod>(['exact', 'alias', 'singular', 'stripped']);

interface OffResponse {
  status?: number;
  product?: {
    product_name?: string;
    product_name_en?: string;
    generic_name?: string;
    brands?: string;
    quantity?: string;
    categories_tags?: string[];
    image_front_small_url?: string;
    image_url?: string;
  };
}

/** `en:canned-tomatoes` -> `canned tomatoes` */
function readableTag(tag: string): string {
  return tag.replace(/^[a-z]{2}:/, '').replace(/-/g, ' ');
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code')?.trim() ?? '';

  // Real barcodes are 8–14 digits (EAN-8 through GTIN-14).
  if (!/^\d{8,14}$/.test(code)) {
    return NextResponse.json(
      { error: 'Expected a barcode of 8 to 14 digits' },
      { status: 400 },
    );
  }

  const cached = getCached(code);
  if (cached) return NextResponse.json(cached);

  // Protects the shared server IP against OFF's 15/min/IP limit.
  const throttle = takeToken();
  if (!throttle.allowed) {
    return NextResponse.json(
      {
        error: 'Too many lookups just now. Try again in a moment.',
        code,
        retryAfterSeconds: throttle.retryAfterSeconds,
      },
      { status: 429, headers: { 'Retry-After': String(throttle.retryAfterSeconds) } },
    );
  }

  let data: OffResponse;
  try {
    const response = await fetch(`${OFF_ENDPOINT}/${code}.json?fields=${FIELDS}`, {
      headers: { 'User-Agent': OFF_USER_AGENT },
      signal: AbortSignal.timeout(6000),
    });

    if (response.status === 404) {
      const miss = { code, found: false, ingredient: null, product: null };
      setCached(code, miss);
      return NextResponse.json(miss);
    }
    if (!response.ok) {
      throw new Error(`Product lookup returned ${response.status}`);
    }
    data = (await response.json()) as OffResponse;
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'TimeoutError'
        ? 'The product database took too long to respond'
        : 'Could not reach the product database';
    // 503 rather than 500: the scanner is fine, the upstream is not, and the
    // client offers manual entry as the fallback.
    return NextResponse.json({ error: message, code }, { status: 503 });
  }

  const product = data.product;
  if (!product || data.status === 0) {
    // Cached too: an unknown barcode stays unknown, and re-scanning the same
    // packet should not spend the budget again.
    const miss = { code, found: false, ingredient: null, product: null };
    setCached(code, miss);
    return NextResponse.json(miss);
  }

  const candidates = [
    // Open Food Facts orders category tags general -> specific, so reverse.
    ...[...(product.categories_tags ?? [])].reverse().map(readableTag),
    product.generic_name,
    product.product_name,
  ].filter((c): c is string => Boolean(c && c.trim()));

  const lexicon = getLexicon();
  let ingredient = null;
  let resolvedFrom: string | null = null;

  for (const candidate of candidates) {
    const resolved = resolveIngredient(candidate, lexicon);
    if (resolved.ingredientId && resolved.method && ACCEPTED_METHODS.has(resolved.method)) {
      ingredient = resolved;
      resolvedFrom = candidate;
      break;
    }
  }

  const payload = {
    code,
    found: true,
    product: {
      // product_name_en first: the app is British-English, and OFF often
      // carries a localised name in the shopper's own language.
      name: product.product_name_en ?? product.product_name ?? product.generic_name ?? null,
      brand: product.brands ?? null,
      quantity: product.quantity ?? null,
      imageUrl: product.image_front_small_url ?? product.image_url ?? null,
    },
    ingredient,
    resolvedFrom,
  };

  setCached(code, payload);
  return NextResponse.json(payload);
}
