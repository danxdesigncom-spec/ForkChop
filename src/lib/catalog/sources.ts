import type { FeatureFlags } from '../flags';
import type { CatalogSource } from './types';

/**
 * Which catalogues the app reads recipes from. ForkChop's own seed corpus is
 * always on; every imported catalogue sits behind its own flag, so turning one
 * off returns the app to exactly the seed corpus with no redeploy of data.
 */
export function enabledCatalogSources(flags: Pick<FeatureFlags, 'catalogThemealdb'>): CatalogSource[] {
  const sources: CatalogSource[] = ['forkchop'];
  if (flags.catalogThemealdb) sources.push('themealdb');
  return sources;
}
