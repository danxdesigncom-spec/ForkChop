import { getAllIngredients } from '../db/queries';
import { createMockProvider } from './mock-provider';
import { PARTNER_CONFIGS, createPartnerProvider } from './partner-providers';
import type { GroceryProvider, ProviderSummary } from './types';

export * from './types';
export { ProviderNotConfiguredError } from './partner-providers';

/**
 * Provider registry.
 *
 * Every storefront the app can talk to is registered here and implements the
 * same `GroceryProvider` interface. Partners without credentials still appear —
 * flagged `configured: false` — so the checkout picker can show them honestly
 * rather than hiding the fact they exist.
 */
function ingredientCategories(): Map<string, string> {
  return new Map(getAllIngredients().map((i) => [i.id, i.category as string]));
}

const providers = new Map<string, () => GroceryProvider>();

providers.set('mock', () => createMockProvider({ categories: ingredientCategories() }));

for (const config of PARTNER_CONFIGS) {
  providers.set(config.id, () => createPartnerProvider(config, ingredientCategories()));
}

export function getGroceryProvider(id = process.env.FORKCHOP_GROCERY_PROVIDER ?? 'mock'): GroceryProvider {
  const factory = providers.get(id);
  if (!factory) {
    throw new Error(
      `Unknown grocery provider "${id}". Registered: ${[...providers.keys()].join(', ')}`,
    );
  }
  return factory();
}

export function listGroceryProviders(): string[] {
  return [...providers.keys()];
}

/**
 * How the UI should present the checkout picker.
 *
 * `hiddenIds` filters providers out entirely — used for feature-flagged
 * partners like Walmart, so turning the flag off makes them disappear from
 * the picker and from the registry-facing API for the same request.
 */
export function describeGroceryProviders(
  options: { hiddenIds?: string[] } = {},
): ProviderSummary[] {
  const hidden = new Set(options.hiddenIds ?? []);
  return [...providers.keys()]
    .filter((id) => !hidden.has(id))
    .map((id) => {
      const provider = getGroceryProvider(id);
      return {
        id: provider.id,
        name: provider.name,
        configured: provider.configured,
        deliveryNote: provider.deliveryNote,
        setupHint: provider.setupHint,
      };
    });
}

/**
 * Ids the caller should refuse for `/api/cart`, given the current flags.
 *
 * `describeGroceryProviders` gates the UI; this gates the server so a client
 * that bypasses the picker cannot still reach a flagged-off provider.
 */
export function disabledGroceryProviderIds(flags: {
  walmart?: boolean;
  kroger?: boolean;
  instacart?: boolean;
}): string[] {
  const disabled: string[] = [];
  if (flags.walmart === false) disabled.push('walmart');
  if (flags.kroger === false) disabled.push('kroger');
  if (flags.instacart === false) disabled.push('instacart');
  return disabled;
}
