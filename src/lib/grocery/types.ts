/**
 * The seam for the online-grocery integration.
 *
 * Everything in the app talks to `GroceryProvider`, never to a specific store.
 * Adding a real partner (Instacart, Kroger, Tesco, Amazon Fresh) means writing
 * one more implementation of this interface and registering it in ./index.ts —
 * no changes to the matcher, the API routes or the UI.
 *
 * Deliberately excluded from this interface: anything that spends money.
 * Providers build a basket and hand back a `checkoutUrl`; the customer
 * completes payment on the store's own domain, under the store's own auth. See
 * the "Grocery integration" section of the README for why.
 */

export interface GroceryLineItem {
  /** Canonical ForkChop ingredient id — the provider maps this to its own SKU. */
  ingredientId: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  /** Recipes that asked for this item, for showing "needed for: X, Y". */
  neededFor: string[];
}

export interface GroceryOffer {
  sku: string;
  ingredientId: string;
  title: string;
  brand: string;
  /** Pack size as the store describes it, e.g. "14.5 oz can". */
  size: string;
  /**
   * The store's own aisle/department name, e.g. "Produce", "Dairy & Eggs".
   * Owned by the provider rather than derived app-side, because a real store's
   * aisle layout is its own taxonomy — and it is what the basket groups by.
   */
  department: string;
  priceCents: number;
  currency: string;
  inStock: boolean;
  /** Cheaper or larger alternatives the store would also accept. */
  alternatives?: Omit<GroceryOffer, 'alternatives'>[];
  /**
   * False when the store gave us no price for this line. Distinct from a zero
   * price: the UI shows "—" rather than "$0.00", and an unpriced line is left
   * out of the subtotal instead of quietly counting as free.
   */
  priced?: boolean;
  /** True when `priceCents` reflects a promotion rather than the shelf price. */
  onPromotion?: boolean;
}

export interface GroceryCartItem {
  offer: GroceryOffer;
  quantity: number;
  lineTotalCents: number;
  neededFor: string[];
}

export interface GroceryCart {
  id: string;
  providerId: string;
  providerName: string;
  items: GroceryCartItem[];
  /** Items we could not source; surfaced so the user is never silently short. */
  unavailable: GroceryLineItem[];
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  currency: string;
  /**
   * The store's aisle order, so the basket can group items by department
   * without the UI hardcoding any particular store's taxonomy.
   */
  departmentOrder: string[];
  /** Where the user completes the purchase. ForkChop never takes payment. */
  checkoutUrl: string;
  estimatedDelivery: string;
  /**
   * Optional. If set, the client copies this string to the clipboard just
   * before opening the checkout URL. Used by providers whose site can't
   * accept a full basket via URL (e.g. Kroger), so the user can paste the
   * list into their search box.
   */
  clipboardText?: string;
  /**
   * Set whenever the money in this cart is an approximation. The UI is
   * required to show it next to the total — a number a shopper might budget
   * against must never look more certain than it is.
   *
   * Absent means the figures are the store's own binding prices.
   */
  priceDisclaimer?: string;
  /** How many line items we managed to price, for an honest "3 of 5" note. */
  pricedItemCount?: number;
  /**
   * When set, the UI can offer to push this basket straight into the user's
   * store account instead of only deep-linking. Hitting this URL starts the
   * store's OAuth consent flow.
   */
  cartHandoffUrl?: string;
}

/** What the checkout picker needs to know about a provider. Never any secrets. */
export interface ProviderSummary {
  id: string;
  name: string;
  configured: boolean;
  deliveryNote?: string;
  setupHint?: string;
}

export interface GroceryProvider {
  id: string;
  name: string;
  currency: string;
  supportsDelivery: boolean;
  /**
   * Department names in the order the store lays them out, so the basket reads
   * like a shopping route rather than an arbitrary list.
   */
  departmentOrder: string[];
  /**
   * False when credentials are missing. An unconfigured provider must refuse to
   * build a cart rather than invent one — the UI shows it as unavailable and
   * explains what is needed.
   */
  configured: boolean;
  /** What an operator must do to connect this provider. */
  setupHint?: string;
  /** One-line delivery promise for the checkout picker. */
  deliveryNote?: string;
  /** Look up what the store sells for a given canonical ingredient. */
  findOffers(items: GroceryLineItem[]): Promise<GroceryOffer[]>;
  /** Build a basket and return a handoff URL. Must not charge anything. */
  createCart(items: GroceryLineItem[]): Promise<GroceryCart>;
}
