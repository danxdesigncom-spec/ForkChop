import { DEPARTMENT_BY_CATEGORY, DEPARTMENT_ORDER } from './departments';
import type {
  GroceryCart,
  GroceryCartItem,
  GroceryLineItem,
  GroceryOffer,
  GroceryProvider,
} from './types';

/**
 * Kroger, via a straightforward deep link — no OAuth, no per-user tokens.
 *
 * Kroger's public site has no shareable "shopping-list URL" the way
 * Instacart's Products Link API does. The only way to push a full basket
 * would be their authenticated Cart API, which needs per-user OAuth and is
 * deliberately out of scope for this pass.
 *
 * So the honest deep link is:
 *   - open kroger.com with a search for the first item (a real jumping-off
 *     point, not a blank page)
 *   - hand the user their full list on the clipboard, so pasting the next
 *     items into Kroger's search is one keystroke
 *
 * The clipboard copy is done client-side in BasketPanel via the
 * `clipboardText` field below. Server code cannot touch the clipboard.
 */

const SEARCH_URL = 'https://www.kroger.com/search';
const CART_HOME = 'https://www.kroger.com/cart';

function buildCheckoutUrl(items: GroceryLineItem[]): string {
  const first = items[0]?.name?.trim();
  if (!first) return CART_HOME;
  return `${SEARCH_URL}?${new URLSearchParams({ query: first }).toString()}`;
}

/**
 * A plain-text list, one item per line — the shape that survives being
 * pasted into Kroger's search box, a notes app, or a text message.
 */
function buildClipboardList(items: GroceryLineItem[]): string {
  return items
    .map((item) => {
      const quantity = item.quantity != null ? `${item.quantity} ` : '';
      const unit = item.unit?.trim() ? `${item.unit} ` : '';
      return `${quantity}${unit}${item.name}`.trim();
    })
    .join('\n');
}

/**
 * Kroger returns nothing itemised, and we don't invent prices. Same shape
 * as the Instacart provider so the picker UI treats them uniformly.
 */
function toCart(items: GroceryLineItem[], categories: Map<string, string>): GroceryCart {
  const cartItems: GroceryCartItem[] = items.map((item) => {
    const category = categories.get(item.ingredientId) ?? 'other';
    const offer: GroceryOffer = {
      sku: `kroger:${item.ingredientId}`,
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
    id: `kroger_${Date.now().toString(36)}`,
    providerId: 'kroger',
    providerName: 'Kroger',
    items: cartItems,
    unavailable: [],
    subtotalCents: 0,
    deliveryFeeCents: 0,
    totalCents: 0,
    currency: 'USD',
    departmentOrder: DEPARTMENT_ORDER,
    checkoutUrl: buildCheckoutUrl(items),
    estimatedDelivery: 'Delivery and pickup times chosen on kroger.com',
    // Read by BasketPanel to copy the list to the clipboard before the
    // handoff. Included in the shape rather than special-cased in the UI so
    // any future provider can opt in with no UI change.
    clipboardText: buildClipboardList(items),
  };
}

export function createKrogerProvider(categories: Map<string, string>): GroceryProvider {
  return {
    id: 'kroger',
    name: 'Kroger',
    currency: 'USD',
    supportsDelivery: true,
    departmentOrder: DEPARTMENT_ORDER,
    // Always configured — the URL scheme is public, no key required.
    configured: true,
    deliveryNote: 'Opens kroger.com with your list on the clipboard',

    async findOffers(items) {
      return items.map<GroceryOffer>((item) => ({
        sku: `kroger:${item.ingredientId}`,
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
      return toCart(items, categories);
    },
  };
}
