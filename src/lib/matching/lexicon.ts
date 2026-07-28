import { getAliasMap, getAllIngredients } from '../db/queries';
import { buildLexicon, type Lexicon } from './normalize';

/**
 * The lexicon is derived entirely from the ingredient catalog, which only
 * changes on re-seed, so building it once per process is safe. Cached on
 * globalThis to survive Next.js hot reloads in dev.
 */
declare global {
  var __forkchopLexicon: Lexicon | undefined;
}

export function getLexicon(): Lexicon {
  if (!globalThis.__forkchopLexicon) {
    globalThis.__forkchopLexicon = buildLexicon(getAllIngredients(), getAliasMap());
  }
  return globalThis.__forkchopLexicon;
}
