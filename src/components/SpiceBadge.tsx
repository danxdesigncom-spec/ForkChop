import type { Recipe } from '@/lib/types';
import { hasHeat, recipeHeat } from '@/lib/spice';

/**
 * Chilli badge for spicy recipes.
 *
 * Distinguishes unavoidable heat from optional heat: a curry built on chilli
 * paste is simply spicy, whereas a pasta with a chilli garnish is only spicy if
 * you choose to add it — flagging both identically would make the badge
 * untrustworthy.
 */
export function SpiceBadge({ recipe, size = 'sm' }: { recipe: Recipe; size?: 'sm' | 'md' }) {
  const heat = recipeHeat(recipe);
  if (!hasHeat(heat)) return null;

  const label = heat.spicy ? 'Spicy' : 'Spicy optional';
  const title = heat.spicy
    ? `Spicy — contains ${heat.sources.join(', ')}`
    : `Only spicy if you add the ${heat.sources.join(', ').toLowerCase()}`;

  return (
    <span
      title={title}
      aria-label={title}
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${
        size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-xs'
      }`}
      style={
        heat.spicy
          ? { backgroundColor: 'var(--score-low-soft)', color: 'var(--score-low)' }
          : {
              backgroundColor: 'transparent',
              color: 'var(--muted)',
              boxShadow: 'inset 0 0 0 1px var(--border)',
            }
      }
    >
      <span aria-hidden>🌶️</span>
      {label}
    </span>
  );
}
