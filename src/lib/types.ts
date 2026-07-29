import type { IngredientCategory } from './db/data/ingredients';
import type { Importance } from './db/data/recipes';

export type { IngredientCategory, Importance };

export interface Ingredient {
  id: string;
  name: string;
  category: IngredientCategory;
  isStaple: boolean;
  /** Allergen ids from src/lib/allergens.ts. */
  allergens: string[];
  /** Carries real chilli heat; see src/lib/spice.ts. */
  isSpicy: boolean;
}

export interface RecipeIngredient extends Ingredient {
  quantity: number | null;
  unit: string | null;
  note: string | null;
  importance: Importance;
}

export interface Recipe {
  id: string;
  slug: string;
  title: string;
  description: string;
  cuisine: string;
  /** Broad region derived from `cuisine`; see src/lib/taxonomy.ts. */
  region: string;
  /** A dish can belong to more than one meal — pancakes are breakfast and brunch. */
  mealTypes: string[];
  /** Diets this recipe satisfies, derived from tags and allergens. */
  diets: string[];
  servings: number;
  prepMinutes: number;
  cookMinutes: number;
  totalMinutes: number;
  difficulty: string;
  emoji: string;
  tags: string[];
  instructions: string[];
  ingredients: RecipeIngredient[];
  /**
   * Which catalogue this came from — 'local' for the bundled corpus, or a
   * provider id such as 'spoonacular'. Optional so existing fixtures and the
   * seeded corpus need no changes; absent means local.
   */
  sourceId?: string;
  /** Photo, where the source has one. Local recipes use `emoji` instead. */
  imageUrl?: string | null;
  /** Link back to the original, for attribution on external recipes. */
  sourceUrl?: string | null;
  /**
   * True when the source could not guarantee allergen data is complete.
   * External sources map onto our allergen list imperfectly, so recipes
   * carrying this are withheld whenever an unmappable allergy is selected.
   */
  allergensUnverified?: boolean;
}

/** How confident we are that a typed phrase means a given catalog ingredient. */
export type ResolutionMethod = 'exact' | 'alias' | 'singular' | 'stripped' | 'partial' | 'fuzzy';

export interface ResolvedIngredient {
  /** Exactly what the user typed. */
  raw: string;
  /** null when we could not map the phrase onto anything in the catalog. */
  ingredientId: string | null;
  name: string | null;
  /** Drives the colour of the pantry chip in the UI. */
  category: IngredientCategory | null;
  confidence: number;
  method: ResolutionMethod | null;
}

/**
 * `ready`   - nothing required is missing, cook it tonight.
 * `almost`  - 1–3 required items short.
 * `stretch` - further away, but still using a decent chunk of the pantry.
 */
export type MatchStatus = 'ready' | 'almost' | 'stretch';

export interface RecipeMatch {
  recipe: Recipe;
  /** 0–1 overall ranking score. */
  score: number;
  /** 0–1, importance-weighted share of required ingredients the user has. */
  coverage: number;
  status: MatchStatus;
  have: RecipeIngredient[];
  missing: RecipeIngredient[];
  /** Missing, but flagged optional — never blocks a recipe from being `ready`. */
  optionalMissing: RecipeIngredient[];
  /** Staples we assumed the user owns rather than reporting as missing. */
  assumedStaples: RecipeIngredient[];
  /** Pantry ingredient ids this recipe actually uses. */
  usedPantryIds: string[];
}

export interface MatchOptions {
  /** Treat salt, oil, water etc. as always available. Default true. */
  assumeStaples?: boolean;
  /**
   * Allergen ids to avoid. Strict: a recipe is dropped if *any* ingredient
   * carries one, optional garnishes included.
   */
  excludeAllergens?: string[];
  /**
   * Ingredient ids the user dislikes. Lenient by comparison: only a required
   * ingredient drops the recipe, since an optional garnish can just be left out.
   */
  dislikedIngredientIds?: string[];
  /**
   * Drop recipes that are unavoidably spicy. Like dislikes, this is lenient:
   * a recipe whose only heat is an optional chilli garnish survives, because
   * you can leave it out.
   */
  excludeSpicy?: boolean;
  /** Drop matches needing more than this many required ingredients. */
  maxMissing?: number;
  /** Only recipes carrying every one of these tags. */
  tags?: string[];
  /** Only recipes meeting every one of these diets (AND — they stack). */
  diets?: string[];
  /** Only recipes from any of these regions (OR — they widen). */
  regions?: string[];
  /** Only recipes served at any of these meals (OR — they widen). */
  mealTypes?: string[];
  /** Only recipes at or under this prep + cook time. */
  maxTotalMinutes?: number;
  limit?: number;
}
