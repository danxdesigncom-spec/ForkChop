import { getAllIngredients } from '../db/queries';
import { PARTNER_CONFIGS, createPartnerProvider } from './partner-providers';
import { createInstacartProvider } from './instacart-provider';
import { createKrogerProvider } from './kroger-provider';
import type { GroceryProvider, ProviderSummary } from './types';
import { getFlags } from '../flags';

export * from './types';
export { ProviderNotConfiguredError } from './partner-providers';

/**
 * Provider registry.
 *
 * Every storefront the app can talk to is registered here and implements the
 * same `GroceryProvider` interface. Partners without credentials still appear —
 * flagged `configured: false` — so the checkout picker can show them honestly
 * rather than hiding the fact they exist.
 *
 * Only real storefronts live here. The demo/mock store was removed: it priced
 * a basket nobody could actually order, which is exactly the kind of
 * plausible-looking lie the partner stubs deliberately avoid telling.
 */
function ingredientCategories(): Map<string, string> {
  return new Map(getAllIngredients().map((i) => [i.id, i.category as string]));
}

const providers = new Map<string, () => GroceryProvider>();

// Kroger has no API key path; it's either on (real deep link) or hidden by
// the flag entirely.
if (getFlags().kroger) {
  providers.set('kroger', () => createKrogerProvider(ingredientCategories()));
}

for (const config of PARTNER_CONFIGS) {
  /**
   * Instacart has a real provider when the feature flag is on. When it's off,
   * we fall through to the stub in partner-providers.ts — that means the
   * option shows up as "not connected" for anyone who has the key set but the
   * flag off, rather than vanishing entirely.
   */
  if (config.id === 'instacart' && getFlags().instacart) {
    providers.set(config.id, () => createInstacartProvider(ingredientCategories()));
    continue;
  }
  providers.set(config.id, () => createPartnerProvider(config, ingredientCategories()));
}

/**
 * Which provider to use when the caller doesn't name one.
 *
 * Resolved at call time rather than pinned to a constant, because the registry
 * itself depends on feature flags — there is no single id that is guaranteed
 * to be registered. Order of preference:
 *
 *   1. FORKCHOP_GROCERY_PROVIDER, when it names a registered provider.
 *   2. Kroger — it deep-links without any API key, so it still works on a
 *      deployment carrying no partner credentials at all.
 *   3. Whatever is registered first.
 *
 * Previously this defaulted to the mock "demo store", which meant a
 * misconfigured deployment silently fell back to fake prices. Now a deployment
 * with nothing registered fails loudly in `getGroceryProvider`.
 */
export function defaultGroceryProviderId(): string {
  const explicit = process.env.FORKCHOP_GROCERY_PROVIDER;
  if (explicit && providers.has(explicit)) return explicit;
  if (providers.has('kroger')) return 'kroger';
  const [first] = providers.keys();
  return first ?? '';
}

export function getGroceryProvider(id = defaultGroceryProviderId()): GroceryProvider {
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
 * partners, so turning a flag off makes one disappear from the picker and
 * from the registry-facing API for the same request.
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
  kroger?: boolean;
  instacart?: boolean;
}): string[] {
  const disabled: string[] = [];
  if (flags.kroger === false) disabled.push('kroger');
  if (flags.instacart === false) disabled.push('instacart');
  return disabled;
}
