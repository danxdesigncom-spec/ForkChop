import { DEPARTMENT_BY_CATEGORY, DEPARTMENT_ORDER } from './departments';
import { ProviderNotConfiguredError } from './partner-providers';
import type {
  GroceryCart,
  GroceryCartItem,
  GroceryLineItem,
  GroceryOffer,
  GroceryProvider,
} from './types';

/**
 * Instacart, via the public Developer Platform "Create shopping list page" API.
 *
 * Deep-link handoff: ForkChop calls Instacart's `products_link` endpoint with
 * the item list, Instacart returns a URL that opens a pre-populated shopping
 * list on their site, and the user completes the cart there. No per-user
 * OAuth, no cart writes. The app's API key is server-only and identifies
 * ForkChop as the partner making the call.
 *
 * Docs:
 *   https://docs.instacart.com/developer_platform_api/api/products/create_shopping_list_page
 *
 * Endpoints:
 *   dev   https://connect.dev.instacart.tools
 *   prod  https://connect.instacart.com
 *
 * We choose based on the `INSTACART_ENV` env var (default: prod), so preview
 * deploys can be pointed at the dev key/host without a code change.
 */

const PROD_HOST = 'https://connect.instacart.com';
const DEV_HOST = 'https://connect.dev.instacart.tools';
const PATH = '/idp/v1/products/products_link';
const TIMEOUT_MS = 8000;

function apiKey(): string | null {
  const key = process.env.INSTACART_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

function host(): string {
  const env = process.env.INSTACART_ENV?.trim().toLowerCase();
  return env === 'dev' ? DEV_HOST : PROD_HOST;
}

/**
 * Instacart cares about a display title. If nothing meaningful can be built,
 * use a stable default rather than an empty string — the docs say `title` is
 * required.
 */
function buildTitle(items: GroceryLineItem[]): string {
  const sources = new Set(items.flatMap((item) => item.neededFor ?? []));
  if (sources.size === 0) return 'Your ForkChop shopping list';
  if (sources.size === 1) return `For ${[...sources][0]}`;
  return `For ${sources.size} recipes`;
}

interface ProductsLinkResponse {
  products_link_url?: string;
}

async function createLink(items: GroceryLineItem[]): Promise<string> {
  const key = apiKey();
  if (!key) throw new ProviderNotConfiguredError('Instacart', SETUP_HINT);

  const body = {
    title: buildTitle(items),
    link_type: 'shopping_list' as const,
    // 30 days is generous but nothing here is time-sensitive; the user opens
    // the link soon after seeing it, or discards it. Instacart's max is 365.
    expires_in: 30,
    line_items: items.map((item) => ({
      name: item.name,
      quantity: item.quantity ?? 1,
      // Instacart accepts free-text units. Empty string is rejected, so fall
      // back to their default of "each".
      unit: item.unit?.trim() || 'each',
    })),
  };

  let response: Response;
  try {
    response = await fetch(`${host()}${PATH}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    throw new Error(
      timedOut ? 'Instacart took too long to respond.' : 'Could not reach Instacart.',
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new ProviderNotConfiguredError(
      'Instacart',
      `${SETUP_HINT} (the current key was rejected)`,
    );
  }
  if (!response.ok) {
    // Instacart's error responses vary; treat any 4xx/5xx as a generic
    // upstream failure rather than making up detail we don't have.
    throw new Error(`Instacart returned ${response.status}.`);
  }

  const data = (await response.json()) as ProductsLinkResponse;
  const url = data.products_link_url;
  if (!url) throw new Error('Instacart returned no link.');
  return url;
}

/**
 * Instacart returns a single URL and does not itemise prices or delivery in
 * the response. We produce a `GroceryCart` shaped like the rest of the app so
 * the picker UI does not need to special-case this provider — the items are
 * echoed back for display, priceCents = 0, and the shopper sees real numbers
 * once the URL opens.
 */
function toCart(items: GroceryLineItem[], url: string, categories: Map<string, string>): GroceryCart {
  const cartItems: GroceryCartItem[] = items.map((item) => {
    const category = categories.get(item.ingredientId) ?? 'other';
    const offer: GroceryOffer = {
      sku: `instacart:${item.ingredientId}`,
      ingredientId: item.ingredientId,
      title: item.name,
      brand: '',
      size: item.unit ? `${item.quantity ?? 1} ${item.unit}` : '',
      department: DEPARTMENT_BY_CATEGORY[category] ?? 'Other',
      priceCents: 0,
      currency: 'USD',
      inStock: true,
    };
    return { offer, quantity: 1, lineTotalCents: 0, neededFor: item.neededFor };
  });

  return {
    id: `instacart_${Date.now().toString(36)}`,
    providerId: 'instacart',
    providerName: 'Instacart',
    items: cartItems,
    unavailable: [],
    // Instacart itemises everything on their own site — we intentionally do
    // not invent totals here. The picker UI already handles zero.
    subtotalCents: 0,
    deliveryFeeCents: 0,
    totalCents: 0,
    currency: 'USD',
    departmentOrder: DEPARTMENT_ORDER,
    checkoutUrl: url,
    estimatedDelivery: 'You pick delivery on the next screen',
  };
}

const SETUP_HINT =
  'Set INSTACART_API_KEY from https://docs.instacart.com/developer_platform_api. ' +
  'Optionally set INSTACART_ENV=dev while using a development key.';

export function createInstacartProvider(categories: Map<string, string>): GroceryProvider {
  const configured = apiKey() !== null;
  return {
    id: 'instacart',
    name: 'Instacart',
    currency: 'USD',
    supportsDelivery: true,
    departmentOrder: DEPARTMENT_ORDER,
    configured,
    setupHint: SETUP_HINT,
    deliveryNote: 'Opens a pre-filled Instacart shopping list',

    async findOffers(items) {
      // Instacart returns matches only once the user opens the link; we have
      // nothing meaningful to say here. Echo the items so the picker UI
      // preview still works.
      return items.map<GroceryOffer>((item) => ({
        sku: `instacart:${item.ingredientId}`,
        ingredientId: item.ingredientId,
        title: item.name,
        brand: '',
        size: '',
        department: DEPARTMENT_BY_CATEGORY[categories.get(item.ingredientId) ?? 'other'] ?? 'Other',
        priceCents: 0,
        currency: 'USD',
        inStock: true,
      }));
    },

    async createCart(items) {
      const url = await createLink(items);
      return toCart(items, url, categories);
    },
  };
}
