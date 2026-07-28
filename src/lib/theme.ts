import type { IngredientCategory } from './types';

/**
 * Colour helpers shared by the UI.
 *
 * These return raw CSS custom properties rather than Tailwind class names,
 * because the values are chosen at runtime and Tailwind can only generate
 * classes it can see at build time.
 */

export type ScoreBand = 'high' | 'mid' | 'low';

/** Traffic light on how much of a recipe the user actually has. */
export function scoreBand(coverage: number): ScoreBand {
  if (coverage >= 0.85) return 'high';
  if (coverage >= 0.55) return 'mid';
  return 'low';
}

export const SCORE_COLOR: Record<ScoreBand, { fg: string; soft: string }> = {
  high: { fg: 'var(--score-high)', soft: 'var(--score-high-soft)' },
  mid: { fg: 'var(--score-mid)', soft: 'var(--score-mid-soft)' },
  low: { fg: 'var(--score-low)', soft: 'var(--score-low-soft)' },
};

export const CATEGORY_COLOR: Record<IngredientCategory, { fg: string; soft: string }> = {
  produce: { fg: 'var(--cat-produce)', soft: 'var(--cat-produce-soft)' },
  protein: { fg: 'var(--cat-protein)', soft: 'var(--cat-protein-soft)' },
  dairy: { fg: 'var(--cat-dairy)', soft: 'var(--cat-dairy-soft)' },
  grain: { fg: 'var(--cat-grain)', soft: 'var(--cat-grain-soft)' },
  bakery: { fg: 'var(--cat-bakery)', soft: 'var(--cat-bakery-soft)' },
  pantry: { fg: 'var(--cat-pantry)', soft: 'var(--cat-pantry-soft)' },
  spice: { fg: 'var(--cat-spice)', soft: 'var(--cat-spice-soft)' },
  condiment: { fg: 'var(--cat-condiment)', soft: 'var(--cat-condiment-soft)' },
  other: { fg: 'var(--cat-other)', soft: 'var(--cat-other-soft)' },
};

export function categoryColor(category: IngredientCategory | null | undefined) {
  return category ? CATEGORY_COLOR[category] : CATEGORY_COLOR.other;
}
