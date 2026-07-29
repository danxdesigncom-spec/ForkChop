import type { Importance, Recipe, RecipeIngredient } from '../../types';
import type { Lexicon } from '../../matching/normalize';
import { resolveIngredient } from '../../matching/normalize';
import { dietsForRecipe } from '../../taxonomy';
import { mealTypesFromDishTypes, regionFromCuisines } from './taxonomy';

/**
 * Turns a Spoonacular payload into ForkChop's `Recipe`.
 *
 * The important part is ingredient resolution: every Spoonacular ingredient is
 * pushed through the same `normalize.ts` resolver the pantry input and the
 * barcode scanner use, so external recipes match against the user's pantry with
 * the same rules as local ones.
 */

export interface SpoonacularIngredient {
  id?: number;
  name?: string;
  nameClean?: string;
  original?: string;
  amount?: number;
  unit?: string;
  meta?: string[];
}

export interface SpoonacularRecipe {
  id: number;
  title: string;
  image?: string | null;
  imageType?: string;
  servings?: number;
  readyInMinutes?: number;
  preparationMinutes?: number;
  cookingMinutes?: number;
  sourceUrl?: string | null;
  spoonacularSourceUrl?: string | null;
  summary?: string;
  cuisines?: string[];
  dishTypes?: string[];
  diets?: string[];
  vegetarian?: boolean;
  vegan?: boolean;
  glutenFree?: boolean;
  dairyFree?: boolean;
  veryHealthy?: boolean;
  cheap?: boolean;
  analyzedInstructions?: { steps?: { number?: number; step?: string }[] }[];
  instructions?: string | null;
  extendedIngredients?: SpoonacularIngredient[];
  usedIngredients?: SpoonacularIngredient[];
  missedIngredients?: SpoonacularIngredient[];
}

/**
 * ForkChop speaks British English — the catalogue says aubergine, coriander,
 * chilli. Spoonacular is American, so a card would otherwise read "Roasted
 * Eggplant Hummus" directly above a "+ Aubergine" chip, which looks like a
 * bug rather than a translation.
 *
 * Applied to titles and descriptions only, and only to food words. Whole-word
 * and case-preserving, so "Eggplant Parmesan" becomes "Aubergine Parmesan"
 * rather than mangling anything mid-word.
 */
const ANGLICISATIONS: [RegExp, string][] = [
  [/\beggplants?\b/gi, 'aubergine'],
  [/\bcilantro\b/gi, 'coriander'],
  [/\bzucchini(s|es)?\b/gi, 'courgette'],
  [/\bgarbanzo beans?\b/gi, 'chickpeas'],
  [/\bscallions?\b/gi, 'spring onion'],
  [/\barugula\b/gi, 'rocket'],
  [/\bshrimps?\b/gi, 'prawns'],
  [/\bchili\b/gi, 'chilli'],
  [/\bconfectioners' sugar\b/gi, 'icing sugar'],
  [/\bheavy cream\b/gi, 'double cream'],
];

function matchCase(replacement: string, original: string): string {
  if (original === original.toUpperCase() && original.length > 1) return replacement.toUpperCase();
  if (original[0] === original[0]?.toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

export function anglicise(text: string): string {
  let out = text;
  for (const [pattern, replacement] of ANGLICISATIONS) {
    out = out.replace(pattern, (match) => {
      // Carry the plural across, or "two eggplants" becomes "two aubergine".
      // Replacements that are already plural (chickpeas, prawns) are left alone.
      const plural = /s$/i.test(match) && !/s$/i.test(replacement);
      return matchCase(plural ? `${replacement}s` : replacement, match);
    });
  }
  return out;
}

/** Spoonacular summaries are HTML with links; the app renders plain text. */
export function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** First sentence or two, so cards do not overflow. */
export function toDescription(recipe: SpoonacularRecipe): string {
  const summary = recipe.summary ? anglicise(stripHtml(recipe.summary)) : '';
  if (!summary) return `${anglicise(recipe.title)} from Spoonacular.`;
  const sentences = summary.split(/(?<=\.)\s+/).slice(0, 2).join(' ');
  return sentences.length > 240 ? `${sentences.slice(0, 237)}…` : sentences;
}

export function toInstructions(recipe: SpoonacularRecipe): string[] {
  const analyzed = recipe.analyzedInstructions?.[0]?.steps ?? [];
  if (analyzed.length > 0) {
    return analyzed.flatMap((s) => (s.step ? [stripHtml(s.step)] : []));
  }
  if (recipe.instructions) {
    return stripHtml(recipe.instructions)
      .split(/(?<=\.)\s+(?=[A-Z])/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Deterministic emoji so external cards do not all look identical where no
 * photo is available. Hash-based rather than random, so a recipe keeps the same
 * face between renders.
 */
const FALLBACK_EMOJI = ['🍽️', '🥘', '🍲', '🥗', '🍛', '🍜', '🥙', '🍝', '🫕', '🥧'];

function emojiFor(id: number): string {
  return FALLBACK_EMOJI[Math.abs(id) % FALLBACK_EMOJI.length];
}

/**
 * Resolve one Spoonacular ingredient onto the canonical catalogue.
 *
 * Anything unrecognised becomes a synthetic `ext:` ingredient rather than being
 * dropped. Dropping would be worse than useless: the recipe would look easier
 * to cook than it is, because an ingredient the user definitely lacks would
 * silently stop counting against it.
 */
export function toRecipeIngredient(
  raw: SpoonacularIngredient,
  lexicon: Lexicon,
  importance: Importance,
): RecipeIngredient | null {
  const label = (raw.nameClean || raw.name || raw.original || '').trim();
  if (!label) return null;

  const resolved = resolveIngredient(label, lexicon);
  const catalogued = resolved.ingredientId ? lexicon.byId.get(resolved.ingredientId) : undefined;

  if (catalogued) {
    return {
      ...catalogued,
      quantity: raw.amount ?? null,
      unit: raw.unit?.trim() || null,
      note: raw.meta?.length ? raw.meta.join(', ') : null,
      importance,
    };
  }

  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    id: `ext:${slug || raw.id || 'unknown'}`,
    name: label.charAt(0).toUpperCase() + label.slice(1),
    category: 'other',
    isStaple: false,
    // Unknown rather than none. The allergen filter is strict, and this is why
    // external recipes are withheld when an unmappable allergy is selected.
    allergens: [],
    isSpicy: /chilli|chili|chile|jalapeno|sriracha|harissa|cayenne/i.test(label),
    quantity: raw.amount ?? null,
    unit: raw.unit?.trim() || null,
    note: raw.meta?.length ? raw.meta.join(', ') : null,
    importance,
  };
}

/**
 * Deduplicates ingredients by id.
 *
 * Spoonacular routinely lists the same thing twice ("garlic" and "garlic
 * cloves"), which after resolution collapse to one catalogue entry. Left
 * unmerged they would double-count in the coverage score.
 */
function dedupe(ingredients: RecipeIngredient[]): RecipeIngredient[] {
  const byId = new Map<string, RecipeIngredient>();
  const rank: Record<Importance, number> = { core: 3, normal: 2, optional: 1 };

  for (const ingredient of ingredients) {
    const existing = byId.get(ingredient.id);
    // Keep the strongest importance seen for a given ingredient.
    if (!existing || rank[ingredient.importance] > rank[existing.importance]) {
      byId.set(ingredient.id, ingredient);
    }
  }
  return [...byId.values()];
}

export function mapSpoonacularRecipe(raw: SpoonacularRecipe, lexicon: Lexicon): Recipe | null {
  if (!raw?.id || !raw.title) return null;

  /**
   * Spoonacular gives no per-ingredient importance, so we infer it: an
   * ingredient the user already has is `normal`, and everything else is
   * `normal` too. Nothing is marked `core`, because guessing wrong there would
   * distort the ranking that makes local recipes good — better to let coverage
   * speak for itself than to invent a signal.
   */
  const all = raw.extendedIngredients?.length
    ? raw.extendedIngredients
    : [...(raw.usedIngredients ?? []), ...(raw.missedIngredients ?? [])];

  const ingredients = dedupe(
    all.flatMap((item) => {
      const mapped = toRecipeIngredient(item, lexicon, 'normal');
      return mapped ? [mapped] : [];
    }),
  );

  if (ingredients.length === 0) return null;

  const prepMinutes = raw.preparationMinutes && raw.preparationMinutes > 0 ? raw.preparationMinutes : 0;
  const cookMinutes = raw.cookingMinutes && raw.cookingMinutes > 0 ? raw.cookingMinutes : 0;
  const totalMinutes =
    raw.readyInMinutes && raw.readyInMinutes > 0 ? raw.readyInMinutes : prepMinutes + cookMinutes;

  const tags: string[] = [];
  if (raw.cheap) tags.push('budget');
  if (totalMinutes > 0 && totalMinutes <= 30) tags.push('quick');
  // Our diet filter reads `vegetarian`/`vegan` from tags, so Spoonacular's
  // booleans have to land there rather than only in `diets`.
  if (raw.vegetarian) tags.push('vegetarian');
  if (raw.vegan) tags.push('vegan');

  const recipe: Recipe = {
    id: `spoonacular-${raw.id}`,
    slug: `spoonacular-${raw.id}`,
    title: anglicise(raw.title.trim()),
    description: toDescription(raw),
    cuisine: raw.cuisines?.[0] ?? 'Spoonacular',
    region: regionFromCuisines(raw.cuisines),
    mealTypes: mealTypesFromDishTypes(raw.dishTypes),
    diets: [],
    servings: raw.servings && raw.servings > 0 ? raw.servings : 2,
    prepMinutes,
    cookMinutes,
    totalMinutes,
    difficulty: totalMinutes > 60 ? 'medium' : 'easy',
    emoji: emojiFor(raw.id),
    tags: [...new Set(tags)],
    instructions: toInstructions(raw),
    ingredients,
    sourceId: 'spoonacular',
    imageUrl: raw.image ?? null,
    sourceUrl: raw.sourceUrl ?? raw.spoonacularSourceUrl ?? null,
    // Spoonacular cannot express mustard or celery intolerance, so its allergen
    // coverage is incomplete by definition.
    allergensUnverified: true,
  };

  // Derived the same way local recipes are, so the diet filter behaves
  // identically for both.
  recipe.diets = dietsForRecipe(recipe);
  return recipe;
}
