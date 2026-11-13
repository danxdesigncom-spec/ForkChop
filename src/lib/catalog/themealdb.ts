/**
 * TheMealDB → ForkChop transform. Pure functions only: no network, no files,
 * no database. `scripts/catalog/import-themealdb.ts` wires these to raw.json,
 * the generated data file and the report; the tests drive them directly.
 *
 * The job that matters is ingredient mapping. ForkChop's ranking only works on
 * ingredients it knows by id, so every source line ends up `mapped`,
 * `ambiguous` or `unmapped`, and any required line that isn't cleanly mapped
 * holds the whole recipe back as `needs_review`. Dropping the line instead
 * would make the recipe look easier to cook than it is: the shopper would see
 * "Ready" while missing something the recipe needs.
 *
 * See docs/catalog/01-themealdb-import.md for the brief and AUDIT.md for why
 * the output is a committed data file rather than database rows.
 */
import type { Importance, Ingredient } from '../types';
import type { Lexicon } from '../matching/normalize';
import { ingredientTokens, partialMatch, resolveIngredient, suggestCorrection } from '../matching/normalize';
import { leftoversAreHarmless, lostAllergens, nameSaysAnimalProduct, nameSaysMeatOrFish } from './mapping-rules';
import { anglicise } from '../recipes/spoonacular/map';
import type {
  ImportedCatalog,
  ImportedIngredientLine,
  ImportedRecipe,
  MappingOutcome,
  ParsedMeasure,
} from './types';

// ------------------------------------------------------------------ raw shapes

/** One meal as TheMealDB's API returns it. Every field is a string or null. */
export type TheMealDbMeal = Record<string, string | null | undefined> & { idMeal: string; strMeal: string };

/** data/sources/themealdb/raw.json, as written by the fetch script. */
export interface TheMealDbRaw {
  source: 'themealdb';
  api_version: string;
  fetched_at: string;
  meals: TheMealDbMeal[];
  [key: string]: unknown;
}

export const THEMEALDB_LICENCE = 'themealdb-api';
export const THEMEALDB_ATTRIBUTION = 'Recipe from TheMealDB';
export const THEMEALDB_IMAGE_LICENCE = 'themealdb';

export function themealdbMealUrl(idMeal: string): string {
  return `https://www.themealdb.com/meal/${encodeURIComponent(idMeal)}`;
}

// ---------------------------------------------------------------- key safety

/**
 * Hides the API key in anything that might be printed or written. Replaces
 * the literal key wherever it appears, and also the key segment of any
 * TheMealDB API path, so a URL is safe even if it was built with a key this
 * function wasn't told about.
 */
export function redactKey(text: string, key?: string | null): string {
  let out = text;
  if (key) out = out.split(key).join('***');
  return out.replace(/(\/api\/json\/v\d+\/)[^/\s?#]+\//g, '$1***/');
}

// ------------------------------------------------------------ ingredient zip

export interface RawIngredientLine {
  position: number;
  name: string;
  measure: string;
}

const blank = (value: string | null | undefined): boolean => !value || value.trim() === '';

/**
 * Pairs strIngredient1..20 with strMeasure1..20. A slot with no ingredient is
 * dropped, even if it has a measure: a measure with nothing to measure is a
 * data-entry leftover, not a line. A slot with an ingredient and no measure is
 * kept ("Salt", "").
 */
export function zipIngredients(meal: TheMealDbMeal): RawIngredientLine[] {
  const lines: RawIngredientLine[] = [];
  for (let i = 1; i <= 20; i++) {
    const name = meal[`strIngredient${i}`];
    if (blank(name)) continue;
    lines.push({
      position: i,
      name: name!.replace(/\s+/g, ' ').trim(),
      measure: (meal[`strMeasure${i}`] ?? '').replace(/\s+/g, ' ').trim(),
    });
  }
  return lines;
}

// ------------------------------------------------------------- measure parse

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4, '⅕': 1 / 5, '⅖': 2 / 5,
  '⅗': 3 / 5, '⅘': 4 / 5, '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8,
};
const FRACTION_CHARS = Object.keys(UNICODE_FRACTIONS).join('');

/** Spellings seen in recipe data → one canonical unit each. */
const UNIT_ALIASES: Record<string, string> = {
  g: 'g', gr: 'g', grm: 'g', gm: 'g', gms: 'g', gram: 'g', grams: 'g', gramme: 'g', grammes: 'g',
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  ml: 'ml', mls: 'ml', millilitre: 'ml', millilitres: 'ml', milliliter: 'ml', milliliters: 'ml',
  l: 'l', ltr: 'l', litre: 'l', litres: 'l', liter: 'l', liters: 'l',
  tsp: 'tsp', tsps: 'tsp', tspn: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  tbsp: 'tbsp', tbsps: 'tbsp', tbs: 'tbsp', tbls: 'tbsp', tblsp: 'tbsp', tbl: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  cup: 'cup', cups: 'cup',
  oz: 'oz', ozs: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  pint: 'pint', pints: 'pint',
  cm: 'cm',
  pinch: 'pinch', pinches: 'pinch',
  handful: 'handful', handfuls: 'handful',
  dash: 'dash', dashes: 'dash',
  splash: 'splash',
  knob: 'knob', knobs: 'knob',
  drizzle: 'drizzle',
  tin: 'tin', tins: 'tin', can: 'tin', cans: 'tin',
  clove: 'clove', cloves: 'clove',
  slice: 'slice', slices: 'slice',
  bunch: 'bunch', bunches: 'bunch',
  sprig: 'sprig', sprigs: 'sprig',
  stick: 'stick', sticks: 'stick',
  stalk: 'stalk', stalks: 'stalk',
  pack: 'pack', packs: 'pack', packet: 'pack', packets: 'pack',
  jar: 'jar', jars: 'jar',
  piece: 'piece', pieces: 'piece',
  fillet: 'fillet', fillets: 'fillet',
  leaf: 'leaf', leaves: 'leaf',
  head: 'head', heads: 'head',
};

/** Units that make sense with no number in front: "Pinch" means one pinch. */
const COUNTLESS_UNITS = new Set(['pinch', 'handful', 'dash', 'splash', 'knob', 'drizzle']);

function readNumber(tokens: string[], index: number): { value: number; next: number } | null {
  const token = tokens[index];
  if (token === undefined) return null;

  const fraction = (t: string | undefined): number | null => {
    if (!t) return null;
    if (UNICODE_FRACTIONS[t] !== undefined) return UNICODE_FRACTIONS[t];
    const m = /^(\d+)\/(\d+)$/.exec(t);
    if (m && Number(m[2]) !== 0) return Number(m[1]) / Number(m[2]);
    return null;
  };

  if (/^\d+(?:\.\d+)?$/.test(token)) {
    const whole = Number(token);
    const frac = fraction(tokens[index + 1]);
    return frac !== null ? { value: whole + frac, next: index + 2 } : { value: whole, next: index + 1 };
  }
  const frac = fraction(token);
  return frac !== null ? { value: frac, next: index + 1 } : null;
}

const round = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * Splits a measure into amount, unit and whatever is left over.
 *
 * Handles "1/2 tsp", "1 ½ cups", "1½", "2-3", "2 to 3", "400g", "1 tin",
 * "2 x 400g tins", "Pinch", "to taste", "Dusting", "sliced". Anything it can't
 * read lands in `note`, and `display` always keeps the original, so a bad
 * parse never loses what the recipe said.
 */
export function parseMeasure(raw: string | null | undefined): ParsedMeasure {
  const display = (raw ?? '').replace(/\s+/g, ' ').trim();
  const empty: ParsedMeasure = { display, quantity: null, quantityMax: null, unit: null, note: null };
  if (!display) return empty;

  const prepared = display
    .replace(new RegExp(`([${FRACTION_CHARS}])`, 'g'), ' $1 ')
    .replace(/(\d),(\d)/g, '$1.$2') // "1,5" → 1.5
    .replace(new RegExp(`(\\d)\\s*(?:-|–|—)\\s*(?=\\d|[${FRACTION_CHARS}])`, 'g'), '$1 - ')
    .replace(/([a-zA-Z])\/(?=\d)/g, '$1 / ') // "175g/6oz": metric first, imperial left in the note
    .replace(/(\d)([a-zA-Z])/g, '$1 $2') // "400g" → "400 g"
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = prepared.split(' ');

  let i = 0;
  // "a pinch", "a handful"
  if (/^an?$/i.test(tokens[0] ?? '') && COUNTLESS_UNITS.has(UNIT_ALIASES[tokens[1]?.toLowerCase() ?? ''] ?? '')) {
    i = 1;
  }

  const first = readNumber(tokens, i);
  let quantity: number | null = null;
  let quantityMax: number | null = null;

  if (first) {
    quantity = round(first.value);
    i = first.next;
    const joiner = tokens[i]?.toLowerCase();
    if (joiner === '-' || joiner === 'to' || joiner === 'or') {
      const second = readNumber(tokens, i + 1);
      if (second) {
        quantityMax = round(second.value);
        i = second.next;
      }
    }
    // "2 x 400g tins": the multiplier is the count; the pack size stays in the note.
    if (tokens[i]?.toLowerCase() === 'x') {
      const note = tokens.slice(i + 1).join(' ') || null;
      return { display, quantity, quantityMax, unit: null, note };
    }
  }

  let unit: string | null = null;
  const unitToken = tokens[i]?.toLowerCase().replace(/\.$/, '');
  const canonical = unitToken ? UNIT_ALIASES[unitToken] : undefined;
  // A unit counts only after a number, or alone for the countless ones
  // ("Pinch"), so the "l" in "large" or the word "can" mid-sentence is never
  // mistaken for one.
  if (canonical && (quantity !== null || COUNTLESS_UNITS.has(canonical))) {
    unit = canonical;
    if (quantity === null) quantity = 1;
    i += 1;
    // "1 tin of chopped tomatoes" → the "of" is grammar, not information.
    if (tokens[i]?.toLowerCase() === 'of') i += 1;
  }

  if (quantity === null) return { ...empty, note: display };

  const note = tokens.slice(i).join(' ').trim() || null;
  return { display, quantity, quantityMax, unit, note };
}

/** Garnishes and serving suggestions: never block a recipe, never count as missing. */
const OPTIONAL_HINT = /\b(to serve|for serving|serving|to garnish|garnish|optional|for decoration|to decorate|decorate|dusting|for dusting|to dust|for greasing|to grease)\b/i;

export function importanceForMeasure(display: string): Importance {
  return OPTIONAL_HINT.test(display) ? 'optional' : 'normal';
}

// ----------------------------------------------------------- taxonomy mapping

export interface IngredientMapping {
  outcome: MappingOutcome;
  ingredientId: string | null;
  method: ImportedIngredientLine['method'];
  candidates: string[];
  /** Why an otherwise-resolved line was held back, for the report. */
  reason: string | null;
}

/** "Pine nuts" → "pine nut", "Chillies" → "chilli", "Tomatoes" → "tomato". Every word, plainly. */
export function plainSingular(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((w) =>
      w.length <= 3 || /ss$/.test(w)
        ? w
        : w.replace(/ies$/, 'y').replace(/(oes|ches|shes|xes)$/, (m) => m.slice(0, -2)).replace(/s$/, ''),
    )
    .join(' ');
}

/** The key used for overrides and in the report: lower-case, single-spaced. */
export function ingredientKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Lands one source ingredient name on the taxonomy.
 *
 * exact / singular / stripped resolutions are trusted, as long as they keep
 * every allergen the name implies. A partial match is trusted only when
 * exactly one entry is the most specific fit and every word left over is a
 * harmless modifier (see mapping-rules.ts): "Baby New Potatoes" is Potato, but
 * "Water Chestnut" is not Water. A fuzzy (typo) match is always `ambiguous`:
 * right for a pantry chip the shopper can correct, wrong as a silent decision
 * about what a recipe needs.
 */
export function mapIngredientName(
  name: string,
  lexicon: Lexicon,
  overrides: Readonly<Record<string, string | null>> = {},
): IngredientMapping {
  const key = ingredientKey(name);
  if (Object.prototype.hasOwnProperty.call(overrides, key)) {
    const id = overrides[key];
    if (id && lexicon.byId.has(id)) return { outcome: 'mapped', ingredientId: id, method: 'override', candidates: [], reason: null };
    return { outcome: 'unmapped', ingredientId: null, method: 'override', candidates: [], reason: null };
  }

  // The shared singulariser misses some plurals ("seeds", "beans", "nuts"),
  // so "Pine nuts" reaches the resolver as a partial match even though "pine
  // nut" is a taxonomy alias. A plain English plural strip that lands on an
  // exact name is the same ingredient by definition, so take it first.
  const plain = plainSingular(name);
  if (plain !== name.toLowerCase().trim()) {
    const exact = resolveIngredient(plain, lexicon);
    if (exact.ingredientId && exact.method === 'exact') {
      const lost = lostAllergens(name, lexicon.byId.get(exact.ingredientId)!);
      if (lost.length === 0) return { outcome: 'mapped', ingredientId: exact.ingredientId, method: 'singular', candidates: [], reason: null };
    }
  }

  const resolved = resolveIngredient(name, lexicon);
  if (!resolved.ingredientId || !resolved.method) {
    return { outcome: 'unmapped', ingredientId: null, method: null, candidates: [], reason: null };
  }

  const hold = (id: string, method: IngredientMapping['method'], reason: string): IngredientMapping => ({
    outcome: 'ambiguous', ingredientId: null, method, candidates: [id], reason,
  });
  const accept = (id: string, method: IngredientMapping['method']): IngredientMapping => {
    const lost = lostAllergens(name, lexicon.byId.get(id)!);
    if (lost.length > 0) return hold(id, method, `would lose allergen: ${lost.join(', ')}`);
    return { outcome: 'mapped', ingredientId: id, method, candidates: [], reason: null };
  };

  switch (resolved.method) {
    case 'exact':
    case 'alias':
    case 'singular':
      return accept(resolved.ingredientId, resolved.method);
    case 'stripped': {
      const id = resolved.ingredientId;
      const tokens = ingredientTokens(name);
      // "Lamb Fat", "Duck fat": the fat, not the meat. The resolver strips
      // "fat" as a prep word because of "low fat yoghurt".
      if (tokens[tokens.length - 1] === 'fat') return hold(id, 'stripped', 'left over: fat');
      // A wrong staple hides a missing ingredient (staples count as owned),
      // so stripping is only trusted onto one when what went is harmless:
      // "Warm Water" is Water, "Roasted pepper" is not Black pepper.
      if (lexicon.byId.get(id)?.isStaple) {
        const own = new Set(
          [lexicon.byId.get(id)!.name, ...[...lexicon.phrases].filter(([, v]) => v === id).map(([p]) => p)].flatMap(ingredientTokens),
        );
        const gone = tokens.filter((t) => !own.has(t));
        if (!leftoversAreHarmless(id, gone)) return hold(id, 'stripped', `left over: ${gone.join(' ')}`);
      }
      return accept(id, 'stripped');
    }
    case 'partial': {
      const { ids, extras } = partialMatch(name, lexicon);
      if (ids.length > 1) return { outcome: 'ambiguous', ingredientId: null, method: 'partial', candidates: ids, reason: 'tie' };
      const id = ids[0] ?? resolved.ingredientId;
      if (!leftoversAreHarmless(id, extras)) return hold(id, 'partial', `left over: ${extras.join(' ')}`);
      return accept(id, 'partial');
    }
    case 'fuzzy':
      return hold(resolved.ingredientId, 'fuzzy', 'typo match');
  }
}

// --------------------------------------------------------------- instructions

/**
 * One step per paragraph or line. TheMealDB separates steps with \r\n and
 * sometimes heads them "STEP 1" on their own line, or numbers them "1." inline;
 * both kinds of numbering go, because the recipe page numbers steps itself.
 */
export function splitInstructions(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n+/)
    .map((line) =>
      line
        .trim()
        .replace(/^step\s*\d+\s*[:.)\-–]?\s*/i, '')
        .replace(/^\d+\s*[.)]\s*/, '')
        .replace(/^[-•▢]\s+/, '')
        .trim(),
    )
    .filter((line) => line.length > 0);
}

// ------------------------------------------------------------------ metadata

const MEALS_BY_CATEGORY: Record<string, string[]> = {
  breakfast: ['breakfast', 'brunch'],
  dessert: ['dessert'],
  side: ['side'],
  starter: ['snack'],
};

/**
 * TheMealDB's category is mostly the main ingredient ("Beef", "Seafood",
 * "Pasta"), which says "a main meal" more than anything. Dinner is the least
 * surprising meal for those, and matches how most seed mains are labelled.
 */
export function mealTypesForCategory(category: string | null | undefined): string[] {
  return MEALS_BY_CATEGORY[(category ?? '').trim().toLowerCase()] ?? ['dinner'];
}

/**
 * Source tags worth keeping, mapped into the seed vocabulary. Everything else
 * ("Meat", "Casserole", "StrongFlavor") stays in `sourceTags` only, because
 * the tag filter offers every distinct tag in the corpus as a chip, and a few
 * hundred free-form ones would bury the twelve it has today.
 *
 * Diet words are deliberately absent: `vegetarian`/`vegan` come only from the
 * category, and only after checking the ingredients agree (see `dietTags`).
 */
const TAG_MAP: Record<string, string> = {
  baking: 'baking',
  cake: 'baking',
  bread: 'baking',
  cheap: 'budget',
  budget: 'budget',
  quick: 'quick',
  speedy: 'quick',
  leftovers: 'leftovers',
  kids: 'kids',
  onepot: 'one-pan',
  'one-pot': 'one-pan',
  onepan: 'one-pan',
  'one-pan': 'one-pan',
  traybake: 'one-pan',
  comfort: 'comfort',
  comfortfood: 'comfort',
};

export function splitSourceTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export function vocabularyTags(sourceTags: string[]): string[] {
  const out = new Set<string>();
  for (const tag of sourceTags) {
    const mapped = TAG_MAP[tag.toLowerCase().replace(/\s+/g, '')];
    if (mapped) out.add(mapped);
  }
  return [...out].sort();
}

/** Proteins that are fine for vegetarians; every other protein is meat or fish. */
const VEGETARIAN_PROTEINS = new Set([
  'egg', 'tofu', 'chickpeas', 'black-beans', 'kidney-beans', 'cannellini-beans', 'red-lentils', 'green-lentils',
]);

export function isMeatOrFish(ingredient: Ingredient): boolean {
  if (ingredient.category === 'protein' && !VEGETARIAN_PROTEINS.has(ingredient.id)) return true;
  // Fish sauce, Worcestershire, oyster sauce, most curry pastes.
  return ingredient.allergens.some((a) => a === 'fish' || a === 'shellfish');
}

export function isAnimalProduct(ingredient: Ingredient): boolean {
  return isMeatOrFish(ingredient) || ingredient.id === 'honey' || ingredient.allergens.some((a) => a === 'dairy' || a === 'egg');
}

/**
 * vegetarian / vegan from the category, checked against what the recipe
 * actually contains. The diet filter trusts these tags absolutely, so a
 * "Vegetarian" category on a dish with fish sauce in it must not produce a
 * vegetarian tag. It's returned as a conflict instead, and the recipe goes to
 * review.
 */
export interface DietLine {
  /** The line's own name, as the recipe gives it. */
  name: string;
  /** What it mapped to, if anything. */
  ingredient?: Ingredient;
}

export function dietTags(category: string | null | undefined, lines: DietLine[]): { tags: string[]; conflicts: string[] } {
  const cat = (category ?? '').trim().toLowerCase();
  if (cat !== 'vegetarian' && cat !== 'vegan') return { tags: [], conflicts: [] };

  // Both what a line mapped to and what its own name says: "Chicken Stock"
  // maps to the neutral Stock, but it is still chicken. One entry per line.
  const conflicts = (test: (l: DietLine) => boolean, label: string) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const line of lines) {
      if (!test(line)) continue;
      const key = line.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(`category is ${label} but contains ${line.name}`);
    }
    return out;
  };

  const meat = conflicts((l) => (l.ingredient ? isMeatOrFish(l.ingredient) : false) || nameSaysMeatOrFish(l.name), category!.trim());
  if (meat.length > 0) return { tags: [], conflicts: meat };
  if (cat === 'vegetarian') return { tags: ['vegetarian'], conflicts: [] };

  const animal = conflicts((l) => (l.ingredient ? isAnimalProduct(l.ingredient) : false) || nameSaysAnimalProduct(l.name), 'Vegan');
  // Still honestly vegetarian; just not vegan.
  if (animal.length > 0) return { tags: ['vegetarian'], conflicts: animal };
  return { tags: ['vegan', 'vegetarian'], conflicts: [] };
}

const EMOJI_BY_CATEGORY: Record<string, string> = {
  beef: '🥩', chicken: '🍗', lamb: '🍖', pork: '🥓', goat: '🍖', seafood: '🐟', pasta: '🍝',
  vegetarian: '🥦', vegan: '🌱', breakfast: '🍳', dessert: '🍰', side: '🥗', starter: '🥟',
  miscellaneous: '🍽️',
};

export function emojiForCategory(category: string | null | undefined): string {
  return EMOJI_BY_CATEGORY[(category ?? '').trim().toLowerCase()] ?? '🍽️';
}

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** For duplicate detection: case, accents, punctuation and "&" vs "and" don't make a recipe different. */
export function normaliseTitle(title: string): string {
  return slugify(title).replace(/-/g, ' ');
}

/**
 * TheMealDB's strArea mixes adjectives ("Italian") with country names
 * ("France", "United States"). Cards read "Italian", and the region filter
 * keys off the adjective, so countries are turned into adjectives.
 */
const AREA_ADJECTIVES: Record<string, string> = {
  'united states': 'American', usa: 'American', america: 'American', france: 'French', norway: 'Norwegian',
  india: 'Indian', netherlands: 'Dutch', argentina: 'Argentinian', venezuela: 'Venezuelan', venezulan: 'Venezuelan',
  slovakia: 'Slovak', italy: 'Italian', spain: 'Spanish', portugal: 'Portuguese', greece: 'Greek', japan: 'Japanese',
  china: 'Chinese', mexico: 'Mexican', thailand: 'Thai', vietnam: 'Vietnamese', turkey: 'Turkish', morocco: 'Moroccan',
  egypt: 'Egyptian', kenya: 'Kenyan', australia: 'Australian', canada: 'Canadian', jamaica: 'Jamaican',
  'united kingdom': 'British', uk: 'British', ireland: 'Irish', poland: 'Polish', russia: 'Russian', ukraine: 'Ukrainian',
  croatia: 'Croatian', philippines: 'Filipino', malaysia: 'Malaysian', tunisia: 'Tunisian', algeria: 'Algerian',
  syria: 'Syrian', 'saudi arabia': 'Saudi Arabian', uruguay: 'Uruguayan',
};

export function cuisineForArea(area: string | null | undefined): string {
  const a = (area ?? '').trim();
  if (!a || a.toLowerCase() === 'unknown') return '';
  return AREA_ADJECTIVES[a.toLowerCase()] ?? a;
}

const httpUrl = (value: string | null | undefined): string | null => {
  const v = value?.trim();
  return v && /^https?:\/\//i.test(v) ? v : null;
};

// ----------------------------------------------------------------- transform

export interface TransformContext {
  lexicon: Lexicon;
  overrides?: Readonly<Record<string, string | null>>;
  /** Stamped on every recipe. Taken from raw.json's fetched_at, so re-running is byte-identical. */
  importedAt: string;
}

export function transformMeal(meal: TheMealDbMeal, ctx: TransformContext): ImportedRecipe {
  const sourceId = String(meal.idMeal).trim();
  const title = anglicise(meal.strMeal.replace(/\s+/g, ' ').trim());
  const category = meal.strCategory?.trim() || null;

  const ingredients: ImportedIngredientLine[] = zipIngredients(meal).map((line) => {
    const measure = parseMeasure(line.measure);
    const name = anglicise(line.name);
    const mapping = mapIngredientName(name, ctx.lexicon, ctx.overrides);
    return {
      position: line.position,
      sourceName: line.name,
      name,
      ...measure,
      importance: importanceForMeasure(measure.display),
      outcome: mapping.outcome,
      ingredientId: mapping.ingredientId,
      method: mapping.method,
      candidates: mapping.candidates,
      reason: mapping.reason,
    };
  });

  const instructions = splitInstructions(meal.strInstructions);

  const sourceTags = splitSourceTags(meal.strTags);
  const diet = dietTags(
    category,
    ingredients.map((l) => ({ name: l.name, ingredient: l.ingredientId ? ctx.lexicon.byId.get(l.ingredientId) : undefined })),
  );

  const reviewReasons: string[] = [];
  if (ingredients.length === 0) reviewReasons.push('no ingredients');
  if (instructions.length === 0) reviewReasons.push('no method');
  for (const line of ingredients) {
    if (line.outcome === 'mapped' || line.importance === 'optional') continue;
    reviewReasons.push(
      line.outcome === 'ambiguous'
        ? `ambiguous: ${line.name} (${line.candidates.join(' | ')}${line.reason && line.reason !== 'tie' ? `; ${line.reason}` : ''})`
        : `unmapped: ${line.name}`,
    );
  }
  reviewReasons.push(...diet.conflicts);

  const sourceUrl = httpUrl(meal.strSource) ?? themealdbMealUrl(sourceId);

  return {
    id: `themealdb-${sourceId}`,
    slug: `${slugify(title) || 'recipe'}-themealdb-${sourceId}`,
    title,
    description: '',
    cuisine: cuisineForArea(meal.strArea),
    mealTypes: mealTypesForCategory(category),
    servings: null,
    prepMinutes: null,
    cookMinutes: null,
    difficulty: null,
    emoji: emojiForCategory(category),
    tags: [...new Set([...diet.tags, ...vocabularyTags(sourceTags)])].sort(),
    sourceTags,
    sourceCategory: category,
    instructions,
    ingredients,
    source: 'themealdb',
    sourceId,
    sourceUrl,
    licence: THEMEALDB_LICENCE,
    attribution: THEMEALDB_ATTRIBUTION,
    attributionUrl: themealdbMealUrl(sourceId),
    imageUrl: httpUrl(meal.strMealThumb),
    imageLicence: httpUrl(meal.strMealThumb) ? THEMEALDB_IMAGE_LICENCE : null,
    videoUrl: httpUrl(meal.strYoutube),
    importedAt: ctx.importedAt,
    status: reviewReasons.length === 0 ? 'ready' : 'needs_review',
    reviewReasons,
  };
}

// ---------------------------------------------------------------------- seed

export interface SeedIngredientRow {
  id: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  display: string | null;
  importance: Importance;
}

const IMPORTANCE_RANK: Record<Importance, number> = { core: 3, normal: 2, optional: 1 };

/**
 * The recipe_ingredients rows for a recipe. Only mapped lines, because the
 * table's foreign key can only point at the taxonomy. That's safe because
 * only `ready` recipes are seeded, and a ready recipe's only unmapped lines are
 * optional ones, which never count as missing anyway.
 *
 * Two lines that land on the same id ("Butter" and "Unsalted Butter") become
 * one row. The row keeps the stronger importance and the first line's amount,
 * and both original measures stay visible in `display`.
 */
export function toSeedIngredientRows(recipe: ImportedRecipe): SeedIngredientRow[] {
  const rows = new Map<string, SeedIngredientRow>();
  for (const line of recipe.ingredients) {
    if (line.outcome !== 'mapped' || !line.ingredientId) continue;
    const display = line.display || null;
    const existing = rows.get(line.ingredientId);
    if (!existing) {
      rows.set(line.ingredientId, {
        id: line.ingredientId,
        quantity: line.quantity,
        unit: line.unit,
        note: line.note,
        display,
        importance: line.importance,
      });
      continue;
    }
    if (IMPORTANCE_RANK[line.importance] > IMPORTANCE_RANK[existing.importance]) existing.importance = line.importance;
    if (display && display !== existing.display) {
      existing.display = existing.display ? `${existing.display}; ${display}` : display;
    }
  }
  return [...rows.values()];
}

// --------------------------------------------------------------------- dedupe

export interface SeedSignature {
  slug: string;
  title: string;
  ingredientIds: string[];
}

export interface Duplicate {
  sourceId: string;
  title: string;
  seedSlug: string;
  reason: 'title' | 'similar title' | 'ingredients';
}

/** Levenshtein distance, for near-identical titles ("Shakshouka" / "Shakshuka"). */
function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

/** Non-staple, non-optional ingredient ids: what actually makes the dish what it is. */
function signatureIds(ids: Iterable<{ id: string; importance: Importance }>, lexicon: Lexicon): string {
  const set = new Set<string>();
  for (const { id, importance } of ids) {
    if (importance === 'optional') continue;
    if (lexicon.byId.get(id)?.isStaple) continue;
    set.add(id);
  }
  return [...set].sort().join(',');
}

/**
 * A TheMealDB recipe duplicates a seed recipe when the normalised titles match
 * (or are one letter apart, a spelling variant), or when the dish needs exactly the same ingredients (at least three of them,
 * so "eggs, butter" doesn't collide with every omelette). The seed recipe
 * always wins: its importance weights rank better than anything inferred.
 */
export function findSeedDuplicate(
  recipe: ImportedRecipe,
  seeds: SeedSignature[],
  lexicon: Lexicon,
): Duplicate | null {
  const title = normaliseTitle(recipe.title);
  const ids = signatureIds(
    recipe.ingredients.flatMap((l) => (l.ingredientId ? [{ id: l.ingredientId, importance: l.importance }] : [])),
    lexicon,
  );
  // Only compare ingredient sets when every required line mapped, or a missing
  // line could make two different dishes look the same.
  const comparable = recipe.ingredients.every((l) => l.outcome === 'mapped' || l.importance === 'optional');

  for (const seed of seeds) {
    if (normaliseTitle(seed.title) === title) {
      return { sourceId: recipe.sourceId, title: recipe.title, seedSlug: seed.slug, reason: 'title' };
    }
  }
  // One letter apart on a title long enough for that to be a spelling, not a
  // different dish. Two or more letters already merges real variants
  // ("Thai prawn curry" vs "Thai Green Curry"), so the line is drawn at one.
  for (const seed of seeds) {
    const seedTitle = normaliseTitle(seed.title);
    if (Math.min(seedTitle.length, title.length) >= 8 && editDistance(seedTitle, title) === 1) {
      return { sourceId: recipe.sourceId, title: recipe.title, seedSlug: seed.slug, reason: 'similar title' };
    }
  }
  if (comparable && ids.split(',').length >= 3) {
    for (const seed of seeds) {
      const seedIds = signatureIds(seed.ingredientIds.map((id) => ({ id, importance: 'normal' as const })), lexicon);
      if (seedIds === ids) {
        return { sourceId: recipe.sourceId, title: recipe.title, seedSlug: seed.slug, reason: 'ingredients' };
      }
    }
  }
  return null;
}

// ----------------------------------------------------------------- the import

export interface ImportResult {
  catalog: ImportedCatalog;
  duplicates: Duplicate[];
  fetched: number;
}

const byNumericId = (a: { sourceId: string }, b: { sourceId: string }) =>
  Number(a.sourceId) - Number(b.sourceId) || a.sourceId.localeCompare(b.sourceId);

/**
 * raw.json in, the committed data file out. Deterministic: the same raw input
 * and taxonomy always produce byte-identical output, which is what makes
 * re-running the import idempotent.
 */
export function importCatalog(
  raw: TheMealDbRaw,
  ctx: Omit<TransformContext, 'importedAt'> & { seeds: SeedSignature[] },
): ImportResult {
  const importedAt = raw.fetched_at;
  const seen = new Set<string>();
  const recipes: ImportedRecipe[] = [];
  const duplicates: Duplicate[] = [];

  const meals = [...raw.meals].sort((a, b) => byNumericId({ sourceId: a.idMeal }, { sourceId: b.idMeal }));
  for (const meal of meals) {
    const id = String(meal.idMeal).trim();
    if (!id || !meal.strMeal || seen.has(id)) continue;
    seen.add(id);

    const recipe = transformMeal(meal, { ...ctx, importedAt });
    const duplicate = findSeedDuplicate(recipe, ctx.seeds, ctx.lexicon);
    if (duplicate) {
      duplicates.push(duplicate);
      continue;
    }
    recipes.push(recipe);
  }

  return {
    catalog: { source: 'themealdb', apiVersion: raw.api_version ?? null, fetchedAt: raw.fetched_at ?? null, recipes },
    duplicates,
    fetched: seen.size,
  };
}

// --------------------------------------------------------------------- report

interface Gap {
  key: string;
  name: string;
  lines: number;
  recipes: Set<string>;
  soleBlocker: Set<string>;
  candidates: Set<string>;
  reasons: Set<string>;
}

const pct = (n: number, d: number) => (d === 0 ? '0.0' : ((n / d) * 100).toFixed(1));
const cell = (s: string) => s.replace(/\|/g, '\\|');

/**
 * data/sources/themealdb/import-report.md. Everything is sorted
 * deterministically, so the report only changes when the data does.
 */
export function buildReport(result: ImportResult, lexicon: Lexicon): string {
  const { recipes } = result.catalog;
  const ready = recipes.filter((r) => r.status === 'ready');
  const review = recipes.filter((r) => r.status === 'needs_review');
  const nameOf = (id: string) => lexicon.byId.get(id)?.name ?? id;

  const unmapped = new Map<string, Gap>();
  const ambiguous = new Map<string, Gap>();
  const partials = new Map<string, { name: string; id: string; lines: number }>();
  const conflicts: string[] = [];
  let totalLines = 0;
  let mappedLines = 0;

  for (const recipe of recipes) {
    const blockingKeys = new Set<string>();
    for (const line of recipe.ingredients) {
      totalLines += 1;
      const key = ingredientKey(line.name);
      if (line.outcome === 'mapped') {
        mappedLines += 1;
        if (line.method === 'partial' && line.ingredientId) {
          const entry = partials.get(key) ?? { name: line.name, id: line.ingredientId, lines: 0 };
          entry.lines += 1;
          partials.set(key, entry);
        }
        continue;
      }
      // Lines already decided as "not in the taxonomy" in the overrides table.
      if (line.method === 'override') continue;
      const table = line.outcome === 'ambiguous' ? ambiguous : unmapped;
      const gap = table.get(key) ?? {
        key, name: line.name, lines: 0, recipes: new Set(), soleBlocker: new Set(), candidates: new Set(), reasons: new Set(),
      };
      gap.lines += 1;
      gap.recipes.add(recipe.sourceId);
      line.candidates.forEach((c) => gap.candidates.add(c));
      if (line.reason) gap.reasons.add(line.reason);
      table.set(key, gap);
      if (line.importance !== 'optional') blockingKeys.add(key);
    }
    const onlyIngredientReasons = recipe.reviewReasons.every((r) => r.startsWith('unmapped: ') || r.startsWith('ambiguous: '));
    if (blockingKeys.size === 1 && onlyIngredientReasons) {
      const [key] = blockingKeys;
      (unmapped.get(key) ?? ambiguous.get(key))?.soleBlocker.add(recipe.sourceId);
    }
    for (const reason of recipe.reviewReasons) {
      if (reason.startsWith('category is')) conflicts.push(`${recipe.title} (${recipe.sourceId}): ${reason}`);
    }
  }

  const rank = (a: Gap, b: Gap) =>
    b.soleBlocker.size - a.soleBlocker.size || b.recipes.size - a.recipes.size || a.key.localeCompare(b.key);
  const unmappedRows = [...unmapped.values()].sort(rank);
  const ambiguousRows = [...ambiguous.values()].sort(rank);

  // Only suggest an existing entry that shares a word with the ingredient.
  // suggestCorrection's last resort is any substring hit, which offered
  // "Sweet potato" for Ham and "Olives" for Chives on the first real import.
  const wordsOf = (t: string) => new Set(ingredientTokens(t));
  const suggestionFor = (gap: Gap): string | null => {
    const id = suggestCorrection(gap.name, lexicon)?.id;
    if (!id) return null;
    const mine = wordsOf(gap.name);
    const theirs = [lexicon.byId.get(id)?.name ?? '', ...[...lexicon.phrases].filter(([, v]) => v === id).map(([p]) => p)];
    return theirs.some((t) => [...wordsOf(t)].some((w) => mine.has(w))) ? id : null;
  };

  const out: string[] = [];
  out.push('# TheMealDB import report');
  out.push('');
  out.push('Generated by `npx tsx scripts/catalog/import-themealdb.ts` from `data/sources/themealdb/raw.json`.');
  out.push('Do not edit by hand; re-run the import instead. See `docs/catalog/01-themealdb-import.md`.');
  out.push('');
  out.push(`- API version: ${result.catalog.apiVersion ?? 'unknown'}`);
  out.push(`- Fetched at: ${result.catalog.fetchedAt ?? 'unknown'}`);
  out.push('');
  out.push('## Totals');
  out.push('');
  out.push('| | Count |');
  out.push('|---|---:|');
  out.push(`| Meals fetched | ${result.fetched} |`);
  out.push(`| Duplicates of seed recipes (skipped, seed kept) | ${result.duplicates.length} |`);
  out.push(`| Imported | ${recipes.length} |`);
  out.push(`| → \`ready\` (seeded, joins matching) | ${ready.length} |`);
  out.push(`| → \`needs_review\` (kept in the data file, not seeded) | ${review.length} |`);
  out.push(`| **Ready rate** (ready ÷ imported) | **${pct(ready.length, recipes.length)} %** |`);
  out.push(`| Ingredient lines mapped | ${mappedLines} of ${totalLines} (${pct(mappedLines, totalLines)} %) |`);
  out.push('');
  out.push('Target from the brief: ≥ 85 % ready.');
  out.push('');

  // Greedy growth path: at each step, the one ingredient that would turn the
  // most recipes `ready` given the ones already chosen. Most review recipes
  // are blocked by two or three ingredients, so the per-ingredient "unlocks"
  // count below understates what a batch of taxonomy work buys.
  const blocking = recipes
    .filter((r) => r.status === 'needs_review' && r.reviewReasons.every((x) => x.startsWith('unmapped: ') || x.startsWith('ambiguous: ')))
    .map((r) => new Set(r.ingredients.filter((l) => l.outcome !== 'mapped' && l.importance !== 'optional').map((l) => ingredientKey(l.name))));
  const display = new Map<string, string>();
  for (const g of [...unmapped.values(), ...ambiguous.values()]) display.set(g.key, g.name);
  const chosen = new Set<string>();
  const path: { name: string; ready: number }[] = [];
  for (let step = 0; step < 30; step++) {
    let best = '';
    let bestFull = -1;
    let bestShare = -1;
    const keys = [...new Set(blocking.flatMap((b) => [...b]))].filter((k) => !chosen.has(k)).sort();
    for (const key of keys) {
      let full = 0;
      let share = 0;
      for (const b of blocking) {
        const left = [...b].filter((k) => !chosen.has(k));
        if (!left.includes(key)) continue;
        share += 1 / left.length;
        if (left.length === 1) full += 1;
      }
      if (full > bestFull || (full === bestFull && share > bestShare)) {
        best = key;
        bestFull = full;
        bestShare = share;
      }
    }
    if (!best) break;
    chosen.add(best);
    path.push({ name: display.get(best) ?? best, ready: ready.length + blocking.filter((b) => [...b].every((k) => chosen.has(k))).length });
  }
  const blockerCounts = new Map<number, number>();
  for (const b of blocking) blockerCounts.set(b.size, (blockerCounts.get(b.size) ?? 0) + 1);

  out.push('## Fastest path to more ready recipes');
  out.push('');
  out.push('Each step adds the one ingredient (an alias, a new taxonomy entry or an override) that turns the');
  out.push('most recipes `ready`, given the steps above it. Use it to batch taxonomy work by payoff.');
  out.push('');
  out.push(
    `Recipes in review because of ingredients, by how many are blocking each: ${[...blockerCounts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([n, c]) => `${n} → ${c}`)
      .join(', ')}.`,
  );
  out.push('');
  out.push('| Step | Add | Ready after | Ready rate |');
  out.push('|---:|---|---:|---:|');
  path.forEach((p, i) => out.push(`| ${i + 1} | ${cell(p.name)} | ${p.ready} | ${pct(p.ready, recipes.length)} % |`));
  if (path.length === 0) out.push('| | Nothing to add | | |');
  out.push('');

  out.push('## Unmapped ingredients — decisions needed');
  out.push('');
  out.push('Ranked by how many recipes would become `ready` if this were the only fix ("unlocks").');
  out.push('For each, either add an alias (when it is just a name for something the taxonomy has), add a');
  out.push('new taxonomy entry, or record `null` in `src/lib/catalog/themealdb-overrides.ts` to accept it as');
  out.push('out of scope.');
  out.push('');
  out.push('| # | Ingredient | Unlocks | Recipes | Lines | Closest existing entry |');
  out.push('|---:|---|---:|---:|---:|---|');
  unmappedRows.forEach((gap, i) => {
    const suggestion = suggestionFor(gap);
    out.push(
      `| ${i + 1} | ${cell(gap.name)} | ${gap.soleBlocker.size} | ${gap.recipes.size} | ${gap.lines} | ${
        suggestion ? `${cell(nameOf(suggestion))} (\`${suggestion}\`)?` : '—'
      } |`,
    );
  });
  if (unmappedRows.length === 0) out.push('| | None | | | | |');
  out.push('');

  out.push('## Ambiguous ingredients');
  out.push('');
  out.push('Resolvable, but not safely: a tie between entries, a typo-distance match, words left over that');
  out.push('change what it is ("Water Chestnut" is not Water), or a mapping that would drop an allergen the');
  out.push('name implies. Decide in the overrides table.');
  out.push('');
  out.push('| Ingredient | Unlocks | Recipes | Candidates | Why held back |');
  out.push('|---|---:|---:|---|---|');
  for (const gap of ambiguousRows) {
    const candidates = [...gap.candidates].sort().map((c) => `${cell(nameOf(c))} (\`${c}\`)`).join(', ');
    out.push(`| ${cell(gap.name)} | ${gap.soleBlocker.size} | ${gap.recipes.size} | ${candidates} | ${cell([...gap.reasons].sort().join('; '))} |`);
  }
  if (ambiguousRows.length === 0) out.push('| None | | | | |');
  out.push('');

  out.push('## Proposed taxonomy changes (for David to approve)');
  out.push('');
  out.push('Nothing below has been applied. Aliases go in the overrides table first; promote them to');
  out.push('`src/lib/db/data/ingredients.ts` only once you are happy for typed pantries to resolve them too.');
  out.push('');
  const aliasRows = unmappedRows.filter((g) => suggestionFor(g) && g.recipes.size >= 1);
  const newRows = unmappedRows.filter((g) => !suggestionFor(g) && g.recipes.size >= 2);
  out.push('### Possible aliases (a close existing entry exists; check it really is the same thing)');
  out.push('');
  if (aliasRows.length === 0) out.push('- None');
  for (const gap of aliasRows.slice(0, 40)) {
    const s = suggestionFor(gap)!;
    out.push(`- \`"${gap.key}": "${s}"\`: ${nameOf(s)}, in ${gap.recipes.size} recipe(s)`);
  }
  out.push('');
  out.push('### Possible new entries (used by 2+ recipes, nothing close in the taxonomy)');
  out.push('');
  if (newRows.length === 0) out.push('- None');
  for (const gap of newRows.slice(0, 60)) {
    out.push(`- **${gap.name}**: in ${gap.recipes.size} recipes; unlocks ${gap.soleBlocker.size} on its own`);
  }
  out.push('');

  out.push('## Partial matches to spot-check');
  out.push('');
  out.push('Mapped by containment rather than an exact name, with only harmless words left over (sizes,');
  out.push('colours, varieties: see `src/lib/catalog/mapping-rules.ts`). Override any that are wrong.');
  out.push('');
  const partialRows = [...partials.entries()].sort((a, b) => b[1].lines - a[1].lines || a[0].localeCompare(b[0]));
  if (partialRows.length === 0) out.push('- None');
  for (const [, p] of partialRows) out.push(`- ${p.name} → ${nameOf(p.id)} (\`${p.id}\`), ${p.lines} line(s)`);
  out.push('');

  out.push('## Diet conflicts');
  out.push('');
  out.push('The category says vegetarian or vegan, but a mapped ingredient disagrees. These recipes are in');
  out.push('review and carry no diet tag.');
  out.push('');
  if (conflicts.length === 0) out.push('- None');
  for (const c of conflicts.sort()) out.push(`- ${c}`);
  out.push('');

  out.push('## Duplicates of seed recipes (skipped)');
  out.push('');
  if (result.duplicates.length === 0) out.push('- None');
  for (const d of [...result.duplicates].sort(byNumericId)) {
    out.push(`- ${d.title} (${d.sourceId}) duplicates \`${d.seedSlug}\` by ${d.reason}`);
  }
  out.push('');

  return `${out.join('\n')}`;
}
