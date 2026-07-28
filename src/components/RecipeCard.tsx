'use client';

import type { RecipeIngredient, RecipeMatch, MatchStatus } from '@/lib/types';
import { formatMinutes } from '@/lib/format';
import { categoryColor } from '@/lib/theme';
import { MatchRing } from './MatchRing';
import { SpiceBadge } from './SpiceBadge';

export const STATUS_LABEL: Record<MatchStatus, string> = {
  ready: 'Ready to cook',
  almost: 'Almost there',
  stretch: 'Worth a shop',
};

const STATUS_STYLE: Record<MatchStatus, { fg: string; soft: string }> = {
  ready: { fg: 'var(--score-high)', soft: 'var(--score-high-soft)' },
  almost: { fg: 'var(--score-mid)', soft: 'var(--score-mid-soft)' },
  stretch: { fg: 'var(--brand)', soft: 'var(--brand-soft)' },
};

interface Props {
  match: RecipeMatch;
  basket: Set<string>;
  saved: boolean;
  onOpen: (match: RecipeMatch) => void;
  onToggleBasket: (ingredient: RecipeIngredient, recipeTitle: string) => void;
  onToggleSaved: (slug: string) => void;
}

export function RecipeCard({
  match,
  basket,
  saved,
  onOpen,
  onToggleBasket,
  onToggleSaved,
}: Props) {
  const { recipe, missing, status } = match;
  const statusStyle = STATUS_STYLE[status];

  return (
    /**
     * The whole card opens the recipe, via a "stretched link": the title button
     * is the real control and its ::after pseudo-element covers the card. That
     * keeps exactly one focusable element for the open action — wrapping the
     * card in a second button would nest interactive elements and break
     * keyboard and screen-reader navigation.
     *
     * The heart and the missing-ingredient chips sit above it on the z-axis, so
     * they keep their own behaviour rather than opening the recipe.
     */
    <article
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-brand hover:shadow-sm"
      style={{ borderTopColor: statusStyle.fg, borderTopWidth: 3 }}
    >
      <div className="flex flex-1 cursor-pointer flex-col p-4">
        <div className="flex items-start gap-3">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-xl text-2xl"
            style={{ backgroundColor: statusStyle.soft }}
            aria-hidden
          >
            {recipe.emoji}
          </span>

          <div className="min-w-0 flex-1">
            <h3 className="font-semibold leading-tight">
              <button
                type="button"
                onClick={() => onOpen(match)}
                className="text-left after:absolute after:inset-0 after:content-[''] group-hover:text-brand"
              >
                {recipe.title}
              </button>
            </h3>
            <p className="mt-0.5 line-clamp-2 text-sm text-muted">{recipe.description}</p>
            <p className="mt-1.5 text-xs text-muted">
              {formatMinutes(recipe.totalMinutes)} · Serves {recipe.servings} · {recipe.cuisine}
            </p>
          </div>

          <div className="flex flex-col items-center gap-1.5">
            <MatchRing value={match.coverage} />
            {/* Above the stretched link, so saving never opens the recipe. */}
            <button
              type="button"
              onClick={() => onToggleSaved(recipe.slug)}
              aria-pressed={saved}
              aria-label={saved ? `Remove ${recipe.title} from My Recipes` : `Save ${recipe.title} to My Recipes`}
              title={saved ? 'Saved to My Recipes' : 'Save to My Recipes'}
              className="relative z-10 text-lg leading-none transition-transform hover:scale-110"
            >
              <span aria-hidden>{saved ? '❤️' : '🤍'}</span>
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
            style={{ backgroundColor: statusStyle.soft, color: statusStyle.fg }}
          >
            {STATUS_LABEL[status]}
          </span>
          <SpiceBadge recipe={recipe} />
          {status === 'ready' && match.optionalMissing.length > 0 && (
            <span className="text-xs text-muted">
              {match.optionalMissing.length} optional extra
              {match.optionalMissing.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {missing.length > 0 && (
          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              You&apos;re missing {missing.length}
            </p>
            {/* Also above the stretched link: adding to the basket from the card
                is a distinct action worth keeping. */}
            <ul className="relative z-10 flex flex-wrap gap-1.5">
              {missing.map((ingredient) => {
                const inBasket = basket.has(ingredient.id);
                const color = categoryColor(ingredient.category);
                return (
                  <li key={ingredient.id}>
                    <button
                      type="button"
                      onClick={() => onToggleBasket(ingredient, recipe.title)}
                      aria-pressed={inBasket}
                      title={
                        inBasket
                          ? `Remove ${ingredient.name} from basket`
                          : `Add ${ingredient.name} to basket`
                      }
                      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
                      style={
                        inBasket
                          ? { backgroundColor: 'var(--brand)', borderColor: 'var(--brand)', color: '#fff' }
                          : { backgroundColor: color.soft, borderColor: color.fg, color: color.fg }
                      }
                    >
                      <span aria-hidden>{inBasket ? '✓' : '+'}</span>
                      {ingredient.name}
                      {ingredient.importance === 'core' && !inBasket && (
                        <span aria-label="essential to this dish" title="Essential to this dish">
                          ★
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </article>
  );
}
