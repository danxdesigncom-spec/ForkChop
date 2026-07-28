import type { GroceryCartItem, GroceryLineItem, GroceryOffer, GroceryProvider } from './types';
import { DEPARTMENT_BY_CATEGORY, DEPARTMENT_ORDER } from './departments';

/**
 * A stand-in store so the whole "missing ingredients -> basket" flow is real
 * and testable before a retail partner is signed.
 *
 * Prices are derived from a hash of the ingredient id, so they are stable
 * across runs (the same item always costs the same) without needing a price
 * table. Nothing here talks to the network and nothing charges anything.
 */

const CURRENCY = 'USD';

/** Rough per-category price bands in US cents, so totals look plausible. */
const PRICE_BANDS: Record<string, [number, number]> = {
  produce: [79, 349],
  protein: [399, 1299],
  dairy: [149, 549],
  grain: [129, 449],
  bakery: [199, 499],
  pantry: [129, 499],
  spice: [199, 599],
  condiment: [199, 599],
  other: [129, 399],
};

const BRANDS = ['Market Pantry', 'Farmhouse', 'Value Basics', 'Chef Reserve', 'Daily Fresh'];

/** Plausible US pack sizes per category, so the store never sells pasta by the bunch. */
const PACK_SIZES: Record<string, string[]> = {
  produce: ['each', 'sold loose, per lb', '10 oz bag', 'bunch'],
  protein: ['1 lb pack', '1.5 lb pack', '5 oz can', '2 fillets'],
  dairy: ['8 oz block', '16 oz tub', '1 quart', '8 oz'],
  grain: ['1 lb box', '2 lb bag', '12 oz pack'],
  bakery: ['each', '20 oz loaf', 'pack of 6'],
  pantry: ['14.5 oz can', '16 oz bag', '12 oz bottle', '8 oz jar'],
  spice: ['1.5 oz jar', '3 oz jar'],
  condiment: ['10 oz bottle', '12 oz jar', '6 oz jar'],
  other: ['each', '1 lb pack'],
};

/**
 * Category bands alone produce a few silly results — eggs share a band with
 * steak, so they came out far too expensive. These are the handful of everyday
 * items worth pinning so the demo reads as plausible at US supermarket prices.
 * A real provider gets prices from the store's API and none of this applies.
 */
const PRICE_OVERRIDES: Record<string, { priceCents: number; size: string }> = {
  egg: { priceCents: 399, size: 'dozen' },
  milk: { priceCents: 379, size: '1 gallon' },
  flour: { priceCents: 299, size: '5 lb bag' },
  onion: { priceCents: 149, size: '3 lb bag' },
  potato: { priceCents: 399, size: '5 lb bag' },
  rice: { priceCents: 349, size: '2 lb bag' },
  pasta: { priceCents: 179, size: '1 lb box' },
  bread: { priceCents: 349, size: '20 oz loaf' },
  butter: { priceCents: 449, size: '1 lb, 4 sticks' },
  garlic: { priceCents: 89, size: '3 bulbs' },
  'chopped-tomatoes': { priceCents: 129, size: '14.5 oz can' },
};

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function priceFor(ingredientId: string, category: string): number {
  const [min, max] = PRICE_BANDS[category] ?? PRICE_BANDS.other;
  const spread = max - min;
  const raw = min + (hash(ingredientId) % spread);
  // Land on a supermarket-looking price ending in 9.
  return Math.round(raw / 10) * 10 - 1;
}

function pick<T>(list: T[], seed: number): T {
  return list[seed % list.length];
}

export interface MockProviderOptions {
  /** Ingredient id -> category, used for price banding and aisle placement. */
  categories?: Map<string, string>;
  /** Ingredient ids to report as out of stock, for exercising that path. */
  outOfStock?: Set<string>;
  deliveryFeeCents?: number;
  /** Spend at or above this and delivery is free. */
  freeDeliveryThresholdCents?: number;
}

export function createMockProvider(options: MockProviderOptions = {}): GroceryProvider {
  const {
    categories = new Map(),
    outOfStock = new Set(),
    deliveryFeeCents = 599,
    freeDeliveryThresholdCents = 3500,
  } = options;

  const buildOffer = (item: GroceryLineItem): GroceryOffer => {
    const seed = hash(item.ingredientId);
    const category = categories.get(item.ingredientId) ?? 'other';
    const sizes = PACK_SIZES[category] ?? PACK_SIZES.other;

    const override = PRICE_OVERRIDES[item.ingredientId];
    const price = override?.priceCents ?? priceFor(item.ingredientId, category);
    const size = override?.size ?? pick(sizes, seed >> 3);

    return {
      sku: `MOCK-${item.ingredientId.toUpperCase().replace(/[^A-Z0-9]/g, '-')}`,
      ingredientId: item.ingredientId,
      title: item.name,
      brand: pick(BRANDS, seed),
      size,
      department: DEPARTMENT_BY_CATEGORY[category] ?? 'Other',
      priceCents: price,
      currency: CURRENCY,
      inStock: !outOfStock.has(item.ingredientId),
      alternatives: [
        {
          sku: `MOCK-${item.ingredientId.toUpperCase()}-VALUE`,
          ingredientId: item.ingredientId,
          title: `${item.name} (value range)`,
          brand: 'Value Basics',
          size: pick(sizes, seed >> 5),
          department: DEPARTMENT_BY_CATEGORY[category] ?? 'Other',
          priceCents: Math.max(79, Math.round((price * 0.72) / 10) * 10 - 1),
          currency: CURRENCY,
          inStock: true,
        },
      ],
    };
  };

  return {
    id: 'mock',
    name: 'ForkChop Demo Store',
    currency: CURRENCY,
    supportsDelivery: true,
    departmentOrder: DEPARTMENT_ORDER,
    configured: true,
    deliveryNote: 'Demo store — priced, but nothing is ordered',

    async findOffers(items) {
      return items.map(buildOffer);
    },

    async createCart(items) {
      const cartItems: GroceryCartItem[] = [];
      const unavailable: GroceryLineItem[] = [];

      for (const item of items) {
        const offer = buildOffer(item);
        if (!offer.inStock) {
          unavailable.push(item);
          continue;
        }
        cartItems.push({
          offer,
          quantity: 1,
          lineTotalCents: offer.priceCents,
          neededFor: item.neededFor,
        });
      }

      const subtotalCents = cartItems.reduce((sum, i) => sum + i.lineTotalCents, 0);
      const deliveryFee = subtotalCents >= freeDeliveryThresholdCents ? 0 : deliveryFeeCents;
      const id = `cart_${hash(items.map((i) => i.ingredientId).join(',')).toString(36)}`;

      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

      return {
        id,
        providerId: 'mock',
        providerName: 'ForkChop Demo Store',
        items: cartItems,
        unavailable,
        subtotalCents,
        deliveryFeeCents: deliveryFee,
        totalCents: subtotalCents + deliveryFee,
        currency: CURRENCY,
        departmentOrder: DEPARTMENT_ORDER,
        // A real provider returns a URL on its own domain where the customer
        // signs in and pays. ForkChop hands off and never handles payment.
        checkoutUrl: `https://example.invalid/checkout/${id}`,
        estimatedDelivery: `${tomorrow.toISOString().slice(0, 10)}, 10:00 AM – 12:00 PM`,
      };
    },
  };
}
