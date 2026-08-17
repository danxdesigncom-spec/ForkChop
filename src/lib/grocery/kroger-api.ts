/**
 * Kroger API client.
 *
 * Two distinct OAuth flows live here, and the difference matters:
 *
 *   client_credentials  — app-level token, scope `product.compact`. Used to
 *                         look up products and prices. No user involved.
 *   authorization_code  — per-user token, scope `cart.basic:write`. Needed to
 *                         push items into a shopper's actual Kroger cart, so
 *                         the shopper must log in to Kroger and consent.
 *
 * Everything degrades: without credentials the provider still works as a plain
 * deep link, exactly as it did before prices existed.
 *
 * Rate limits published by Kroger: products 10,000/day, locations 1,600/day,
 * cart 5,000/day. Product lookups are cached (see PRODUCT_CACHE_TTL_MS) because
 * a basket price-up costs one call per line item and prices barely move.
 */

const API_BASE = 'https://api.kroger.com/v1';
const TOKEN_URL = `${API_BASE}/connect/oauth2/token`;
export const AUTHORIZE_URL = `${API_BASE}/connect/oauth2/authorize`;

export const PRODUCT_SCOPE = 'product.compact';
export const CART_SCOPE = 'cart.basic:write';

function clientId(): string {
  return process.env.KROGER_CLIENT_ID?.trim() ?? '';
}

function clientSecret(): string {
  return process.env.KROGER_CLIENT_SECRET?.trim() ?? '';
}

/**
 * The store whose shelf prices we quote. Kroger returns no price at all
 * without a locationId — prices are per-store — so pricing is off until this
 * is set. Find one with GET /v1/locations?filter.zipCode.near=<zip>.
 */
export function krogerLocationId(): string {
  return process.env.KROGER_LOCATION_ID?.trim() ?? '';
}

/**
 * True when we can call the Products API at all.
 *
 * A store is required because Kroger returns no price without one, but it can
 * come from the shopper's own choice rather than the env default — so pass
 * their locationId when they have picked one.
 */
export function isKrogerPricingConfigured(locationIdOverride?: string): boolean {
  const locationId = locationIdOverride?.trim() || krogerLocationId();
  return Boolean(clientId() && clientSecret() && locationId);
}

/** True when credentials exist, regardless of whether a store is chosen yet. */
export function hasKrogerCredentials(): boolean {
  return Boolean(clientId() && clientSecret());
}

/** True when the per-user "push to cart" handoff can be attempted. */
export function isKrogerCartConfigured(): boolean {
  return Boolean(clientId() && clientSecret() && krogerRedirectUri());
}

export function krogerRedirectUri(): string {
  const explicit = process.env.KROGER_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '');
  return site ? `${site}/api/kroger/callback` : '';
}

function basicAuthHeader(): string {
  return `Basic ${Buffer.from(`${clientId()}:${clientSecret()}`).toString('base64')}`;
}

/* ------------------------------------------------------------------ tokens */

interface CachedToken {
  token: string;
  /** Epoch ms. Deliberately short of the real expiry — see below. */
  expiresAt: number;
}

let appToken: CachedToken | null = null;

/**
 * App-level token for product lookups.
 *
 * Cached in module memory. On serverless this is per-instance, which is fine:
 * a cold start just re-fetches. The cached expiry is shortened by 60s so a
 * token never expires mid-flight on a request that already passed the check.
 */
export async function getProductToken(): Promise<string | null> {
  if (!clientId() || !clientSecret()) return null;

  if (appToken && appToken.expiresAt > Date.now()) return appToken.token;

  // A network failure here must not propagate: every caller is expected to
  // degrade to an unpriced basket, and an exception would instead fail the
  // whole cart request.
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: PRODUCT_SCOPE,
      }),
      cache: 'no-store',
    });

    if (!res.ok) return null;

    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) return null;

    appToken = {
      token: json.access_token,
      expiresAt: Date.now() + Math.max(0, (json.expires_in ?? 1800) - 60) * 1000,
    };
    return appToken.token;
  } catch {
    return null;
  }
}

/** Exchange an authorization code for a per-user token carrying CART_SCOPE. */
export async function exchangeCodeForUserToken(code: string): Promise<string | null> {
  if (!clientId() || !clientSecret()) return null;

  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: krogerRedirectUri(),
      }),
      cache: 'no-store',
    });

    if (!res.ok) return null;
    const json = (await res.json()) as { access_token?: string };
    return json.access_token ?? null;
  } catch {
    // The callback route turns null into a 'failed' outcome and still lands
    // the shopper on the store's cart page.
    return null;
  }
}

/* ---------------------------------------------------------------- products */

export interface KrogerProduct {
  upc: string;
  description: string;
  brand: string;
  size: string;
  /** Shelf price in cents, promo price preferred when one is running. */
  priceCents: number;
  /** True when priceCents came from a promotion rather than the regular price. */
  onPromotion: boolean;
  inStock: boolean;
}

interface KrogerProductResponse {
  data?: {
    upc?: string;
    description?: string;
    brand?: string;
    items?: {
      size?: string;
      price?: { regular?: number; promo?: number };
      inventory?: { stockLevel?: string };
    }[];
  }[];
}

/**
 * Product lookups are cached because pricing a basket costs one API call per
 * line item, against a 10,000/day budget. Six hours is well inside the window
 * where a supermarket shelf price is still a fair estimate.
 */
const PRODUCT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const productCache = new Map<string, { value: KrogerProduct | null; expiresAt: number }>();

/** Exported for tests — module state would otherwise leak between cases. */
export function clearKrogerCaches(): void {
  appToken = null;
  productCache.clear();
  locationCache.clear();
  zipCache.clear();
}

function toProduct(json: KrogerProductResponse): KrogerProduct | null {
  const entry = json.data?.[0];
  if (!entry?.upc) return null;

  const item = entry.items?.[0];
  const regular = item?.price?.regular;
  const promo = item?.price?.promo;

  // Kroger sends promo: 0 when nothing is running, so a zero is "no promo",
  // not "free". Only treat a positive promo as a real price.
  const hasPromo = typeof promo === 'number' && promo > 0;
  const dollars = hasPromo ? promo : regular;
  if (typeof dollars !== 'number' || dollars <= 0) return null;

  const stockLevel = item?.inventory?.stockLevel?.toUpperCase();

  return {
    upc: entry.upc,
    description: entry.description ?? '',
    brand: entry.brand ?? '',
    size: item?.size ?? '',
    priceCents: Math.round(dollars * 100),
    onPromotion: hasPromo,
    // Kroger omits inventory for many items; absent is treated as available
    // rather than out of stock, since claiming "out of stock" wrongly is the
    // more harmful error.
    inStock: stockLevel !== 'TEMPORARILY_OUT_OF_STOCK' && stockLevel !== 'OUT_OF_STOCK',
  };
}

/**
 * Best-effort product match for a plain ingredient name.
 *
 * `filter.term` is a fuzzy search, so the first result is a reasonable but not
 * exact match — which is precisely why every price this produces is presented
 * to the user as an estimate. Returns null on any failure; callers fall back
 * to an unpriced line rather than inventing a number.
 */
export async function findKrogerProduct(
  term: string,
  /** Overrides the env default — set when the shopper has picked their store. */
  locationIdOverride?: string,
): Promise<KrogerProduct | null> {
  const locationId = locationIdOverride?.trim() || krogerLocationId();
  if (!locationId) return null;

  const key = `${locationId}:${term.toLowerCase().trim()}`;
  const cached = productCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const token = await getProductToken();
  if (!token) return null;

  const query = new URLSearchParams({
    'filter.term': term,
    'filter.locationId': locationId,
    'filter.limit': '1',
  });

  let product: KrogerProduct | null = null;
  try {
    const res = await fetch(`${API_BASE}/products?${query}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (res.ok) product = toProduct((await res.json()) as KrogerProductResponse);
  } catch {
    // Network failure is not fatal — an unpriced basket still deep-links fine.
    product = null;
  }

  productCache.set(key, { value: product, expiresAt: Date.now() + PRODUCT_CACHE_TTL_MS });
  return product;
}

/* --------------------------------------------------------------- locations */

export interface KrogerLocation {
  locationId: string;
  /** Banner name as Kroger brands it, e.g. "Food 4 Less - Highland Center". */
  name: string;
  /** Banner code — see kroger-banners.ts. */
  chain: string;
  addressLine1: string;
  city: string;
  state: string;
  zipCode: string;
}

interface KrogerLocationResponse {
  data?: {
    locationId?: string;
    name?: string;
    chain?: string;
    address?: {
      addressLine1?: string;
      city?: string;
      state?: string;
      zipCode?: string;
    };
  }[];
}

function toLocations(json: KrogerLocationResponse): KrogerLocation[] {
  return (json.data ?? [])
    .filter((entry) => entry.locationId)
    .map((entry) => ({
      locationId: entry.locationId as string,
      name: entry.name ?? '',
      chain: entry.chain ?? '',
      addressLine1: entry.address?.addressLine1 ?? '',
      city: entry.address?.city ?? '',
      state: entry.address?.state ?? '',
      zipCode: entry.address?.zipCode ?? '',
    }));
}

/**
 * Locations has a much tighter budget than products — 1,600 calls/day — and a
 * store's address and banner never change, so both lookups are cached for a
 * day rather than hours.
 */
const LOCATION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const locationCache = new Map<string, { value: KrogerLocation | null; expiresAt: number }>();
const zipCache = new Map<string, { value: KrogerLocation[]; expiresAt: number }>();

/** Stores near a zip code, for the store picker. */
export async function searchKrogerLocations(zipCode: string): Promise<KrogerLocation[]> {
  const key = zipCode.trim();
  const cached = zipCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const token = await getProductToken();
  if (!token) return [];

  const query = new URLSearchParams({
    'filter.zipCode.near': key,
    'filter.limit': '12',
  });

  let locations: KrogerLocation[] = [];
  try {
    const res = await fetch(`${API_BASE}/locations?${query}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (res.ok) locations = toLocations((await res.json()) as KrogerLocationResponse);
  } catch {
    locations = [];
  }

  zipCache.set(key, { value: locations, expiresAt: Date.now() + LOCATION_CACHE_TTL_MS });
  return locations;
}

/** One store by id — used to resolve which banner to brand the checkout with. */
export async function getKrogerLocation(locationId: string): Promise<KrogerLocation | null> {
  const key = locationId.trim();
  if (!key) return null;

  const cached = locationCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const token = await getProductToken();
  if (!token) return null;

  let location: KrogerLocation | null = null;
  try {
    const res = await fetch(`${API_BASE}/locations/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (res.ok) {
      const json = (await res.json()) as { data?: KrogerLocationResponse['data'] extends (infer T)[] ? T : never };
      location = toLocations({ data: json.data ? [json.data] : [] })[0] ?? null;
    }
  } catch {
    location = null;
  }

  locationCache.set(key, { value: location, expiresAt: Date.now() + LOCATION_CACHE_TTL_MS });
  return location;
}

/* -------------------------------------------------------------------- cart */

export interface KrogerCartLine {
  upc: string;
  quantity: number;
}

/**
 * Push items into the signed-in shopper's Kroger cart.
 *
 * Requires a token from the authorization_code flow carrying `cart.basic:write`.
 * Note that Kroger gates this scope behind developer-portal approval, so an app
 * that has not been granted it will fail here even with valid credentials —
 * hence the boolean return and the deep-link fallback at the call site.
 */
export async function addToKrogerCart(
  userToken: string,
  lines: KrogerCartLine[],
): Promise<boolean> {
  if (lines.length === 0) return true;

  try {
    const res = await fetch(`${API_BASE}/cart/add`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ items: lines }),
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}
