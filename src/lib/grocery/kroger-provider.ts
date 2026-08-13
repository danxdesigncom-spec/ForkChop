import { DEPARTMENT_BY_CATEGORY, DEPARTMENT_ORDER } from './departments';
import {
  findKrogerProduct,
  isKrogerCartConfigured,
  isKrogerPricingConfigured,
  type KrogerProduct,
} from './kroger-api';
import type {
  GroceryCart,
  GroceryCartItem,
  GroceryLineItem,
  GroceryOffer,
  GroceryProvider,
} from './types';

/**
 * Kroger.
 *
 * Works at three levels depending on how much is configured, and each level
 * is honest about what it can and cannot do:
 *
 *   1. No credentials — a plain deep link to kroger.com search, with the list
 *      on the clipboard. Always available; needs no keys.
 *   2. + KROGER_CLIENT_ID/SECRET/LOCATION_ID — every line is priced from the
 *      Products API. Prices are ESTIMATES and are labelled as such: the match
 *      is a fuzzy search, the store may differ from the shopper's, and tax and
 *      fees are added at Kroger's checkout.
 *   3. + KROGER_REDIRECT_URI — offers to push the basket into the shopper's
 *      real Kroger cart via OAuth, so they don't re-pick every item.
 *
 * Level 1 is the floor. If pricing fails at request time — network error, rate
 * limit, no product match — the cart still builds and still deep-links; the
 * affected lines are simply marked unpriced rather than given a made-up number.
 */

const SEARCH_URL = 'https://www.kroger.com/search';
const CART_HOME = 'https://www.kroger.com/cart';

const PRICE_DISCLAIMER =
  'Estimated prices — your final total is set at Kroger checkout and will vary by store, availability, promotions and tax.';

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

function department(ingredientId: string, categories: Map<string, string>): string {
  return DEPARTMENT_BY_CATEGORY[categories.get(ingredientId) ?? 'other'] ?? 'Other';
}

/** An offer with no price attached — the shape used when pricing is off or failed. */
function unpricedOffer(item: GroceryLineItem, categories: Map<string, string>): GroceryOffer {
  return {
    sku: `kroger:${item.ingredientId}`,
    ingredientId: item.ingredientId,
    title: item.name,
    brand: '',
    size: item.unit ? `${item.quantity ?? 1} ${item.unit}` : '',
    department: department(item.ingredientId, categories),
    priceCents: 0,
    currency: 'USD',
    inStock: true,
    priced: false,
  };
}

function pricedOffer(
  item: GroceryLineItem,
  product: KrogerProduct,
  categories: Map<string, string>,
): GroceryOffer {
  return {
    // The real UPC, so the cart handoff can address the exact product we priced.
    sku: product.upc,
    ingredientId: item.ingredientId,
    // Kroger's own description is more useful at the shelf than our generic
    // ingredient name ("Kroger Whole Milk, 1 gal" beats "Milk").
    title: product.description || item.name,
    brand: product.brand,
    size: product.size,
    department: department(item.ingredientId, categories),
    priceCents: product.priceCents,
    currency: 'USD',
    inStock: product.inStock,
    priced: true,
    onPromotion: product.onPromotion,
  };
}

/**
 * Look every line up in parallel. One slow or failing lookup must not hold up
 * the rest, so each is settled independently and a rejection degrades that
 * single line to unpriced.
 */
async function priceItems(
  items: GroceryLineItem[],
  categories: Map<string, string>,
): Promise<GroceryOffer[]> {
  if (!isKrogerPricingConfigured()) {
    return items.map((item) => unpricedOffer(item, categories));
  }

  const results = await Promise.allSettled(items.map((item) => findKrogerProduct(item.name)));

  return items.map((item, index) => {
    const result = results[index];
    if (result.status !== 'fulfilled' || !result.value) {
      return unpricedOffer(item, categories);
    }
    return pricedOffer(item, result.value, categories);
  });
}

async function toCart(
  items: GroceryLineItem[],
  categories: Map<string, string>,
): Promise<GroceryCart> {
  const offers = await priceItems(items, categories);

  const cartItems: GroceryCartItem[] = offers.map((offer, index) => {
    const quantity = 1;
    return {
      offer,
      quantity,
      // An unpriced line contributes nothing rather than counting as free.
      lineTotalCents: offer.priced ? offer.priceCents * quantity : 0,
      neededFor: items[index]?.neededFor ?? [],
    };
  });

  const pricedItemCount = cartItems.filter((i) => i.offer.priced).length;
  const subtotalCents = cartItems.reduce((sum, i) => sum + i.lineTotalCents, 0);

  /**
   * The handoff is only offered once we actually have UPCs to send. Without
   * pricing there is nothing to add to a cart, so the deep link stands alone.
   */
  const upcs = cartItems.filter((i) => i.offer.priced).map((i) => i.offer.sku);
  const canHandOff = isKrogerCartConfigured() && upcs.length > 0;

  return {
    id: `kroger_${Date.now().toString(36)}`,
    providerId: 'kroger',
    providerName: 'Kroger',
    items: cartItems,
    unavailable: [],
    subtotalCents,
    deliveryFeeCents: 0,
    totalCents: subtotalCents,
    currency: 'USD',
    departmentOrder: DEPARTMENT_ORDER,
    checkoutUrl: buildCheckoutUrl(items),
    estimatedDelivery: 'Delivery and pickup times chosen on kroger.com',
    // Read by BasketPanel to copy the list to the clipboard before the
    // handoff. Included in the shape rather than special-cased in the UI so
    // any future provider can opt in with no UI change.
    clipboardText: buildClipboardList(items),
    // Only claim these are estimates when there is actually money on screen.
    priceDisclaimer: pricedItemCount > 0 ? PRICE_DISCLAIMER : undefined,
    pricedItemCount,
    cartHandoffUrl: canHandOff ? '/api/kroger/authorize' : undefined,
  };
}

export function createKrogerProvider(categories: Map<string, string>): GroceryProvider {
  const priced = isKrogerPricingConfigured();

  return {
    id: 'kroger',
    name: 'Kroger',
    currency: 'USD',
    supportsDelivery: true,
    departmentOrder: DEPARTMENT_ORDER,
    // Always configured — the deep link is public and needs no key. Pricing
    // is an enhancement on top, not a precondition.
    configured: true,
    deliveryNote: priced
      ? 'Estimated prices, then hand off to kroger.com'
      : 'Opens kroger.com with your list on the clipboard',

    async findOffers(items) {
      return priceItems(items, categories);
    },

    async createCart(items) {
      return toCart(items, categories);
    },
  };
}
