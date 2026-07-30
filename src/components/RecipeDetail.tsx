'use client';

import { useEffect, useRef } from 'react';
import type { Recipe, RecipeIngredient, RecipeMatch } from '@/lib/types';
import { formatAmount, formatMinutes } from '@/lib/format';
import { STATUS_LABEL } from './RecipeCard';
import { SpiceBadge } from './SpiceBadge';
import { RecipeRating, type RatingValue } from './RecipeRating';

interface Props {
  match: RecipeMatch;
  basket: Set<string>;
  saved: boolean;
  onClose: () => void;
  onToggleBasket: (ingredient: RecipeIngredient, recipeTitle: string) => void;
  onAddAllMissing: (match: RecipeMatch) => void;
  onToggleSaved: (slug: string, recipe?: Recipe) => void;
  /** Null when the ratings feature is off; the widget is hidden entirely. */
  rating: RatingValue | null;
  canRate: boolean;
  onRate: (slug: string, stars: number) => Promise<void>;
  onSignInRequired: () => void;
}

export function RecipeDetail({
  match,
  basket,
  saved,
  onClose,
  onToggleBasket,
  onAddAllMissing,
  onToggleSaved,
  rating,
  canRate,
  onRate,
  onSignInRequired,
}: Props) {
  const { recipe } = match;
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    // Stop the page behind the modal from scrolling.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const haveIds = new Set(match.have.map((i) => i.id));
  const assumedIds = new Set(match.assumedStaples.map((i) => i.id));
  const missingIds = new Set(match.missing.map((i) => i.id));

  const statusFor = (ingredient: RecipeIngredient) => {
    if (haveIds.has(ingredient.id)) return 'have' as const;
    if (assumedIds.has(ingredient.id)) return 'assumed' as const;
    if (missingIds.has(ingredient.id)) return 'missing' as const;
    return 'optional-missing' as const;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recipe-detail-title"
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-border
                   bg-surface sm:rounded-2xl"
      >
        <header className="sticky top-0 flex items-start gap-3 border-b border-border bg-surface p-5">
          {recipe.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={recipe.imageUrl}
              alt=""
              loading="lazy"
              className="size-14 shrink-0 rounded-xl object-cover"
            />
          ) : (
            <span className="text-4xl leading-none" aria-hidden>
              {recipe.emoji}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 id="recipe-detail-title" className="text-xl font-semibold leading-tight">
              {recipe.title}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {formatMinutes(recipe.prepMinutes)} prep · {formatMinutes(recipe.cookMinutes)} cook ·
              Serves {recipe.servings} · {recipe.difficulty}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onToggleSaved(recipe.slug, recipe)}
            aria-pressed={saved}
            className={`shrink-0 rounded-xl border-2 px-3 py-1.5 text-sm font-semibold transition-colors
              ${saved ? 'border-brand bg-brand-soft text-brand-strong' : 'border-border hover:border-brand hover:text-brand'}`}
          >
            <span aria-hidden>{saved ? '❤️' : '🤍'}</span> {saved ? 'Saved' : 'Save'}
          </button>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close recipe"
            className="rounded-lg px-2 py-1 text-muted hover:bg-surface-muted hover:text-foreground"
          >
            ✕
          </button>
        </header>

        <div className="space-y-6 p-5">
          <p className="text-sm">{recipe.description}</p>

          <div className="flex flex-wrap gap-1.5">
            <SpiceBadge recipe={recipe} size="md" />
            {rating && (
              <div className="mt-1 basis-full">
                <RecipeRating
                  slug={recipe.slug}
                  value={rating}
                  canVote={canRate}
                  onChange={onRate}
                  onSignInRequired={onSignInRequired}
                />
              </div>
            )}
            {recipe.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs text-muted"
              >
                {tag}
              </span>
            ))}
          </div>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-semibold">Ingredients</h3>
              <span className="text-xs text-muted">{STATUS_LABEL[match.status]}</span>
            </div>

            <ul className="space-y-1.5">
              {recipe.ingredients.map((ingredient) => {
                const state = statusFor(ingredient);
                const amount = formatAmount(ingredient);

                return (
                  <li
                    key={ingredient.id}
                    className="flex items-baseline gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-muted"
                  >
                    <span
                      aria-hidden
                      className={
                        state === 'have'
                          ? 'text-score-high'
                          : state === 'assumed'
                            ? 'text-muted'
                            : state === 'missing'
                              ? 'text-score-mid'
                              : 'text-muted'
                      }
                    >
                      {state === 'have' ? '✓' : state === 'assumed' ? '·' : '○'}
                    </span>

                    <span className="flex-1">
                      <span className={state === 'missing' ? 'font-medium' : ''}>{ingredient.name}</span>
                      {amount && <span className="text-muted"> — {amount}</span>}
                      {state === 'assumed' && (
                        <span className="ml-1.5 text-xs text-muted">(assumed staple)</span>
                      )}
                      {ingredient.importance === 'optional' && (
                        <span className="ml-1.5 text-xs text-muted">(optional)</span>
                      )}
                    </span>

                    {(state === 'missing' || state === 'optional-missing') && (
                      <button
                        type="button"
                        onClick={() => onToggleBasket(ingredient, recipe.title)}
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-xs
                          ${
                            basket.has(ingredient.id)
                              ? 'border-brand bg-brand text-white'
                              : 'border-border hover:border-brand hover:text-brand'
                          }`}
                      >
                        {basket.has(ingredient.id) ? '✓ In basket' : '+ Add'}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>

            {match.missing.length > 0 && (
              <button
                type="button"
                onClick={() => onAddAllMissing(match)}
                className="mt-4 w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white
                           hover:bg-brand-strong"
              >
                Add all {match.missing.length} missing ingredient
                {match.missing.length === 1 ? '' : 's'} to basket
              </button>
            )}
          </section>

          <section>
            <h3 className="mb-3 font-semibold">Method</h3>
            <ol className="space-y-3">
              {recipe.instructions.map((step, index) => (
                <li key={index} className="flex gap-3 text-sm">
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-full
                               bg-brand-soft text-xs font-semibold text-brand-strong"
                    aria-hidden
                  >
                    {index + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
