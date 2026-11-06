'use client';

import { Clock, Heart, Users } from 'lucide-react';
import { formatMinutes } from '@/lib/format';
import type { RecipeMatch } from '@/lib/types';
import { MatchBadge } from './MatchBadge';
import { MissingChip } from './MissingChip';
import { RecipeVisual } from './RecipeVisual';
import { StatusTag } from './StatusTag';
import { cn } from './cn';

interface Props {
  match: RecipeMatch;
  saved: boolean;
  onToggleSave: (match: RecipeMatch) => void;
  /** Opens RecipeDetail. Only the title triggers it; the card isn't a link. */
  onOpen: (match: RecipeMatch) => void;
  /** Ingredient names already in the basket. */
  inBasket: ReadonlySet<string>;
  onAddMissing: (name: string, match: RecipeMatch) => void;
  /** `row` is the mobile layout: 96×112 thumbnail beside the text. */
  layout?: 'card' | 'row';
  headingLevel?: 'h2' | 'h3';
}

export function RecipeCardV2({
  match,
  saved,
  onToggleSave,
  onOpen,
  inBasket,
  onAddMissing,
  layout = 'card',
  headingLevel = 'h3',
}: Props) {
  const { recipe } = match;
  const Heading = headingLevel;
  const missing = match.missing.map((i) => i.name);
  const row = layout === 'row';

  const title = (
    <Heading className={cn('font-display font-semibold leading-tight text-foreground', row ? 'text-lg' : 'text-[21px]')}>
      <button type="button" onClick={() => onOpen(match)} className="rounded-sm text-left hover:underline">
        {recipe.title}
      </button>
    </Heading>
  );

  const save = (
    <button
      type="button"
      aria-label={`Save ${recipe.title}`}
      aria-pressed={saved}
      onClick={() => onToggleSave(match)}
      className={cn(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground',
        row ? 'bg-raised' : 'absolute right-3 top-3 bg-surface/90',
      )}
    >
      <Heart aria-hidden="true" size={20} className={saved ? 'fill-radish text-radish' : undefined} />
    </button>
  );

  const meta = (
    <ul className="flex flex-wrap gap-x-3.5 gap-y-1 text-[13px] text-muted">
      <li className="inline-flex items-center gap-1 whitespace-nowrap">
        <Clock aria-hidden="true" size={14} />
        {formatMinutes(recipe.totalMinutes)}
      </li>
      <li className="inline-flex items-center gap-1 whitespace-nowrap">
        <Users aria-hidden="true" size={14} />
        Serves {recipe.servings}
      </li>
      {recipe.cuisine && <li className="whitespace-nowrap">{recipe.cuisine}</li>}
    </ul>
  );

  const footer = (
    <div className={cn('flex flex-wrap items-center gap-2', !row && 'mt-auto border-t border-raised pt-3.5')}>
      {missing.length === 0 ? (
        <StatusTag missingCount={0} />
      ) : (
        <>
          {!row && <span className="text-[13px] font-semibold text-saffron-text">Missing {missing.length}:</span>}
          {missing.map((name) => (
            <MissingChip key={name} name={name} inBasket={inBasket.has(name)} onAdd={(n) => onAddMissing(n, match)} />
          ))}
        </>
      )}
    </div>
  );

  if (row) {
    return (
      <article className="flex gap-3.5 rounded-[18px] border border-border bg-surface p-3">
        <RecipeVisual recipe={recipe} sizes="96px" className="h-28 w-24 shrink-0 rounded-xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
            {title}
            <MatchBadge coverage={match.coverage} missing={missing} size={36} />
          </div>
          {meta}
          {footer}
        </div>
      </article>
    );
  }

  return (
    <article className="flex flex-col overflow-hidden rounded-[20px] border border-border bg-surface">
      <div className="relative">
        <RecipeVisual recipe={recipe} sizes="(min-width: 1024px) 33vw, 100vw" className="h-[188px]" />
        {save}
      </div>
      <div className="flex flex-1 flex-col gap-2.5 px-5 pb-5 pt-4">
        <div className="flex items-start justify-between gap-3">
          {title}
          <MatchBadge coverage={match.coverage} missing={missing} />
        </div>
        {recipe.description && <p className="line-clamp-2 text-sm leading-normal text-muted">{recipe.description}</p>}
        {meta}
        {footer}
      </div>
    </article>
  );
}
