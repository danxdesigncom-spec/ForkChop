import { DEPARTMENT_BY_CATEGORY, DEPARTMENT_ORDER } from './departments';
import type { GroceryLineItem, GroceryOffer, GroceryProvider } from './types';

/**
 * Real retail partners: Instacart and Walmart.
 *
 * Both are implemented against the real `GroceryProvider` seam and both read
 * their credentials from the environment. Neither invents prices, availability
 * or a checkout URL: without a key they report `configured: false` and the UI
 * says plainly that the connection is not set up, rather than showing a
 * branded button that quietly does nothing.
 *
 * Wiring one up is a matter of supplying the key and filling in `createCart`
 * against the partner's API — the surrounding app needs no changes.
 *
 *   Instacart  Developer Platform, "Create shopping list page" endpoint.
 *              Set INSTACART_API_KEY.
 *   Walmart    Affiliate / Partner API. Set WALMART_API_KEY.
 */

export class ProviderNotConfiguredError extends Error {
  constructor(
    readonly providerName: string,
    readonly setupHint: string,
  ) {
    super(`${providerName} is not connected. ${setupHint}`);
    this.name = 'ProviderNotConfiguredError';
  }
}

interface PartnerConfig {
  id: string;
  name: string;
  envVar: string;
  setupHint: string;
  deliveryNote: string;
}

const PARTNERS: PartnerConfig[] = [
  {
    id: 'instacart',
    name: 'Instacart',
    envVar: 'INSTACART_API_KEY',
    setupHint:
      'Set INSTACART_API_KEY from the Instacart Developer Platform, then implement createCart against their shopping-list endpoint.',
    deliveryNote: 'Same-day delivery from local stores',
  },
  {
    id: 'walmart',
    name: 'Walmart+',
    envVar: 'WALMART_API_KEY',
    setupHint:
      'Set WALMART_API_KEY from the Walmart Partner API, then implement createCart against their cart endpoint.',
    deliveryNote: 'Free delivery on Walmart+ orders',
  },
];

function buildLineItemOffer(item: GroceryLineItem, category: string): GroceryOffer {
  // Shape only — a configured provider replaces this with the store's own
  // catalog data. Never surfaced while `configured` is false.
  return {
    sku: '',
    ingredientId: item.ingredientId,
    title: item.name,
    brand: '',
    size: '',
    department: DEPARTMENT_BY_CATEGORY[category] ?? 'Other',
    priceCents: 0,
    currency: 'USD',
    inStock: true,
  };
}

export function createPartnerProvider(
  config: PartnerConfig,
  categories: Map<string, string>,
): GroceryProvider {
  const apiKey = process.env[config.envVar];
  const configured = Boolean(apiKey);

  return {
    id: config.id,
    name: config.name,
    currency: 'USD',
    supportsDelivery: true,
    departmentOrder: DEPARTMENT_ORDER,
    configured,
    setupHint: config.setupHint,
    deliveryNote: config.deliveryNote,

    async findOffers(items) {
      if (!configured) throw new ProviderNotConfiguredError(config.name, config.setupHint);
      return items.map((item) =>
        buildLineItemOffer(item, categories.get(item.ingredientId) ?? 'other'),
      );
    },

    async createCart() {
      // Deliberately not faked. Returning a plausible-looking cart and checkout
      // URL for a store we are not actually talking to would be a lie the user
      // could act on.
      throw new ProviderNotConfiguredError(config.name, config.setupHint);
    },
  };
}

export const PARTNER_CONFIGS = PARTNERS;
