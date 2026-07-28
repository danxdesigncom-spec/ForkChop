import type { Ingredient, ResolvedIngredient, ResolutionMethod } from '../types';

/**
 * Turns whatever a human types into a canonical ingredient id.
 *
 * The pipeline is deliberately staged, and each stage attempts a lookup before
 * the next one strips more information away. That ordering matters: "ground
 * coriander" must resolve to the spice, but strip the word "ground" first and
 * it collapses onto the fresh herb. Same story for "ground beef" vs "beef".
 */

const UNITS = new Set([
  'g', 'gram', 'grams', 'kg', 'kilo', 'kilos', 'kilogram', 'kilograms',
  'ml', 'l', 'litre', 'litres', 'liter', 'liters', 'cl',
  'tsp', 'teaspoon', 'teaspoons', 'tbsp', 'tablespoon', 'tablespoons',
  'cup', 'cups', 'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds',
  'pinch', 'pinches', 'handful', 'handfuls', 'dash', 'splash', 'knob', 'drizzle',
  'can', 'cans', 'tin', 'tins', 'jar', 'jars', 'packet', 'packets', 'pack', 'packs',
  'bunch', 'bunches', 'sprig', 'sprigs', 'stick', 'sticks', 'stalk', 'stalks',
  'clove', 'cloves', 'bulb', 'head', 'heads', 'slice', 'slices', 'piece', 'pieces',
  'fillet', 'fillets', 'thumb', 'block', 'tub', 'punnet', 'box', 'bag',
]);

/**
 * Grammatical filler carrying no ingredient information. Safe to remove before
 * prep words, and removed in its own stage: "400g tin of chopped tomatoes"
 * needs "of" gone but "chopped" kept, or it collapses onto fresh tomatoes.
 */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'of', 'and', 'or', 'some', 'few', 'to', 'taste', 'for',
  'serving', 'serve', 'garnish', 'optional', 'about', 'approx', 'plus',
  'more', 'into', 'in', 'with', 'my', 'i', 'have', 'got', 'has', 'x',
]);

/**
 * Words that describe amount, state or preparation rather than identity.
 * Removing these is the last resort before fuzzy matching.
 */
const PREP_WORDS = new Set([
  'chopped', 'diced', 'minced', 'sliced', 'grated', 'shredded', 'crushed',
  'ground', 'fresh', 'freshly', 'dried', 'frozen', 'canned', 'tinned',
  'cooked', 'raw', 'boneless', 'skinless', 'peeled', 'deseeded', 'seeded',
  'halved', 'quartered', 'cubed', 'torn', 'drained', 'rinsed', 'softened',
  'melted', 'beaten', 'roasted', 'toasted', 'ripe', 'unripe', 'unsalted',
  'salted', 'organic', 'free', 'range', 'extra', 'virgin', 'whole', 'plain',
  'thinly', 'roughly', 'finely', 'coarsely', 'lightly', 'large', 'medium',
  'small', 'big', 'good', 'quality', 'leftover', 'cold', 'hot', 'warm',
  'lukewarm', 'low', 'fat', 'reduced', 'skimmed', 'semi', 'light', 'dark',
]);

/** Irregular plurals worth special-casing; everything else uses the rules below. */
const IRREGULAR_SINGULARS: Record<string, string> = {
  leaves: 'leaf',
  loaves: 'loaf',
  knives: 'knife',
  halves: 'half',
  potatoes: 'potato',
  tomatoes: 'tomato',
  mangoes: 'mango',
  chillies: 'chilli',
  berries: 'berry',
  anchovies: 'anchovy',
};

/** Words that end in "s" but are not plurals — stripping the s breaks them. */
const NEVER_SINGULARIZE = new Set([
  'peas', 'oats', 'greens', 'grass', 'couscous', 'hummus', 'molasses',
  'asparagus', 'swiss', 'chips', 'crisps', 'noodles', 'oats', 'olives',
  'beans', 'lentils', 'nuts', 'seeds', 'herbs', 'greens', 'bass', 'less',
]);

export function singularizeWord(word: string): string {
  if (word.length <= 3) return word;
  if (NEVER_SINGULARIZE.has(word)) return word;
  if (IRREGULAR_SINGULARS[word]) return IRREGULAR_SINGULARS[word];

  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith('ves') && word.length > 4) return `${word.slice(0, -3)}f`;
  if (/(ch|sh|ss|x|z)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('oes') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) return word.slice(0, -1);
  return word;
}

/** Lowercase, drop punctuation/parentheticals, and split into words. */
function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')     // "(about 400g)"
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, ' ')  // keeps hyphens; strips ½, commas, etc.
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Drops quantities and measurement words: "2 tbsp olive oil" -> "olive oil". */
function stripQuantities(tokens: string[]): string[] {
  return tokens.filter((t) => {
    if (/^[\d./]+$/.test(t)) return false;        // 2, 1/2, 1.5
    if (/^\d+(g|kg|ml|l|oz|lb)$/.test(t)) return false; // 400g, 250ml
    if (UNITS.has(t)) return false;
    return true;
  });
}

export interface Lexicon {
  /** normalized phrase -> ingredient id */
  phrases: Map<string, string>;
  byId: Map<string, Ingredient>;
  /** ingredient id -> the phrase variants that point at it, longest first */
  phrasesById: Map<string, string[]>;
}

/**
 * Builds the lookup structures once, from the ingredient catalog plus its
 * alias table. Cheap enough to rebuild per request, but callers should cache.
 */
export function buildLexicon(ingredients: Ingredient[], aliases: Map<string, string>): Lexicon {
  const phrases = new Map<string, string>();
  const byId = new Map<string, Ingredient>();
  const phrasesById = new Map<string, string[]>();

  const add = (phrase: string, id: string) => {
    const key = stripQuantities(tokenize(phrase)).join(' ');
    if (!key) return;
    if (!phrases.has(key)) phrases.set(key, id);

    const singular = key.split(' ').map(singularizeWord).join(' ');
    if (singular !== key && !phrases.has(singular)) phrases.set(singular, id);
  };

  for (const ing of ingredients) {
    byId.set(ing.id, ing);
    add(ing.name, ing.id);
  }
  for (const [alias, id] of aliases) {
    add(alias, id);
  }

  for (const [phrase, id] of phrases) {
    const list = phrasesById.get(id) ?? [];
    list.push(phrase);
    phrasesById.set(id, list);
  }
  for (const list of phrasesById.values()) {
    list.sort((a, b) => b.length - a.length);
  }

  return { phrases, byId, phrasesById };
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Typo tolerance scaled to word length. Short words get none — "rice" and
 * "lime" are only two edits apart, and guessing wrong there is worse than
 * admitting we did not recognise the input.
 */
function fuzzyBudget(len: number): number {
  if (len <= 4) return 0;
  if (len <= 7) return 1;
  if (len <= 11) return 2;
  return 3;
}

const CONFIDENCE: Record<ResolutionMethod, number> = {
  exact: 1,
  alias: 0.97,
  singular: 0.93,
  stripped: 0.85,
  partial: 0.72,
  fuzzy: 0.6,
};

/**
 * Resolve one free-text phrase against the lexicon.
 * Returns `ingredientId: null` when nothing matched confidently enough — the UI
 * surfaces those back to the user rather than silently dropping them.
 */
export function resolveIngredient(raw: string, lexicon: Lexicon): ResolvedIngredient {
  const trimmed = raw.trim();
  const miss: ResolvedIngredient = {
    raw: trimmed,
    ingredientId: null,
    name: null,
    category: null,
    confidence: 0,
    method: null,
  };
  if (!trimmed) return miss;

  const hit = (id: string, method: ResolutionMethod): ResolvedIngredient => ({
    raw: trimmed,
    ingredientId: id,
    name: lexicon.byId.get(id)?.name ?? null,
    category: lexicon.byId.get(id)?.category ?? null,
    confidence: CONFIDENCE[method],
    method,
  });

  // Stage 1 — as typed, minus punctuation and quantities.
  const tokens = stripQuantities(tokenize(trimmed));
  if (tokens.length === 0) return miss;

  const asTyped = tokens.join(' ');
  const exact = lexicon.phrases.get(asTyped);
  if (exact) return hit(exact, 'exact');

  // Stage 2 — singularized. "chicken breasts" -> "chicken breast".
  const singular = tokens.map(singularizeWord);
  const singularPhrase = singular.join(' ');
  const singularHit = lexicon.phrases.get(singularPhrase);
  if (singularHit) return hit(singularHit, 'singular');

  // Stage 3 — grammatical filler removed, descriptive words kept.
  const withoutStopWords = singular.filter((t) => !STOP_WORDS.has(t));
  const stopPhrase = withoutStopWords.join(' ');
  if (stopPhrase && stopPhrase !== singularPhrase) {
    const stopHit = lexicon.phrases.get(stopPhrase);
    if (stopHit) return hit(stopHit, 'stripped');
  }

  // Stage 4 — prep words removed too. Runs only now, so "ground coriander" and
  // "ground beef" have already had their chance to match intact.
  const stripped = withoutStopWords.filter((t) => !PREP_WORDS.has(t));
  const strippedPhrase = stripped.join(' ');
  if (strippedPhrase && strippedPhrase !== stopPhrase) {
    const strippedHit = lexicon.phrases.get(strippedPhrase);
    if (strippedHit) return hit(strippedHit, 'stripped');
  }

  // Stage 5 — partial containment, preferring the most specific phrase.
  // "free range chicken breast fillets" -> "chicken breast".
  const searchTokens = stripped.length > 0 ? stripped : singular;
  const searchSet = new Set(searchTokens);
  let best: { id: string; length: number } | null = null;

  for (const [phrase, id] of lexicon.phrases) {
    const phraseTokens = phrase.split(' ');
    if (phraseTokens.length > searchTokens.length) continue;
    if (!phraseTokens.every((t) => searchSet.has(t))) continue;
    if (!best || phraseTokens.length > best.length) best = { id, length: phraseTokens.length };
  }
  if (best) return hit(best.id, 'partial');

  // Stage 6 — a single typo somewhere.
  const candidate = strippedPhrase || singularPhrase;
  const budget = fuzzyBudget(candidate.length);
  if (budget > 0) {
    let bestFuzzy: { id: string; distance: number } | null = null;
    for (const [phrase, id] of lexicon.phrases) {
      if (Math.abs(phrase.length - candidate.length) > budget) continue;
      const distance = levenshtein(phrase, candidate);
      if (distance <= budget && (!bestFuzzy || distance < bestFuzzy.distance)) {
        bestFuzzy = { id, distance };
      }
    }
    if (bestFuzzy) return hit(bestFuzzy.id, 'fuzzy');
  }

  return miss;
}

/** Resolve a whole pantry, de-duplicating repeats that map to the same id. */
export function resolvePantry(inputs: string[], lexicon: Lexicon): ResolvedIngredient[] {
  const results: ResolvedIngredient[] = [];
  const seen = new Set<string>();

  for (const input of inputs) {
    const resolved = resolveIngredient(input, lexicon);
    const key = resolved.ingredientId ?? `?${resolved.raw.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(resolved);
  }

  return results;
}

/** Ingredient-name suggestions for the pantry input's autocomplete. */
export function suggestIngredients(query: string, lexicon: Lexicon, limit = 8): Ingredient[] {
  const q = stripQuantities(tokenize(query)).join(' ');
  if (!q) return [];

  const scored: { ingredient: Ingredient; rank: number }[] = [];

  for (const ingredient of lexicon.byId.values()) {
    const name = ingredient.name.toLowerCase();
    const variants = lexicon.phrasesById.get(ingredient.id) ?? [];

    let rank = Infinity;
    if (name === q) rank = 0;
    else if (name.startsWith(q)) rank = 1;
    else if (variants.some((v) => v === q)) rank = 2;
    else if (variants.some((v) => v.startsWith(q))) rank = 3;
    else if (name.includes(q)) rank = 4;
    else if (variants.some((v) => v.includes(q))) rank = 5;

    if (rank !== Infinity) scored.push({ ingredient, rank });
  }

  scored.sort((a, b) => a.rank - b.rank || a.ingredient.name.localeCompare(b.ingredient.name));
  return scored.slice(0, limit).map((s) => s.ingredient);
}
