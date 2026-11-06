import type { Importance, ResolutionMethod } from '../types';

/**
 * Shapes shared by the catalogue importers and the seeder.
 *
 * An imported recipe keeps every source ingredient line, mapped or not, so the
 * data file is a complete record of what the source said and what we made of
 * it. Only `ready` recipes are seeded into SQLite; see docs/catalog/AUDIT.md.
 */

export type CatalogSource = 'forkchop' | 'themealdb';

export type RecipeStatus = 'ready' | 'needs_review';

/** How one source ingredient line landed on the taxonomy. */
export type MappingOutcome = 'mapped' | 'ambiguous' | 'unmapped';

export interface ParsedMeasure {
  /** The measure as the source wrote it, whitespace-collapsed. '' when blank. */
  display: string;
  /** Lower bound for a range ("2-3" → 2). */
  quantity: number | null;
  /** Upper bound for a range ("2-3" → 3); null otherwise. */
  quantityMax: number | null;
  /** Canonical unit: g, kg, ml, l, tsp, tbsp, cup, oz, lb, pinch, tin, clove… */
  unit: string | null;
  /** Whatever is left once the amount and unit are taken off ("finely chopped"). */
  note: string | null;
}

export interface ImportedIngredientLine extends ParsedMeasure {
  /** 1–20: which strIngredientN/strMeasureN pair this came from. */
  position: number;
  /** Ingredient name exactly as the source gave it (trimmed). */
  sourceName: string;
  /** The same name after the British English pass. */
  name: string;
  importance: Importance;
  outcome: MappingOutcome;
  ingredientId: string | null;
  /** How the resolver got there; 'override' for the import-only table. */
  method: ResolutionMethod | 'override' | null;
  /** Ambiguous lines: the ids it could be. */
  candidates: string[];
}

export interface ImportedRecipe {
  id: string;
  slug: string;
  title: string;
  description: string;
  cuisine: string;
  mealTypes: string[];
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  difficulty: string | null;
  emoji: string;
  /** Tags in ForkChop's filter vocabulary only. */
  tags: string[];
  /** The source's own tags, verbatim, for reference. */
  sourceTags: string[];
  /** The source's own course/category ("Chicken", "Dessert"). */
  sourceCategory: string | null;
  instructions: string[];
  ingredients: ImportedIngredientLine[];

  source: Exclude<CatalogSource, 'forkchop'>;
  sourceId: string;
  sourceUrl: string | null;
  licence: string;
  attribution: string;
  attributionUrl: string | null;
  imageUrl: string | null;
  imageLicence: string | null;
  videoUrl: string | null;
  importedAt: string;

  status: RecipeStatus;
  /** Why a recipe is `needs_review`, one entry per blocking line or problem. */
  reviewReasons: string[];
}

/** The committed data file the seeder reads (src/lib/db/data/themealdb.json). */
export interface ImportedCatalog {
  /** Provenance of the input, copied from raw.json. */
  source: Exclude<CatalogSource, 'forkchop'>;
  apiVersion: string | null;
  fetchedAt: string | null;
  recipes: ImportedRecipe[];
}
