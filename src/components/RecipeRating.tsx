'use client';

import { useState } from 'react';

/**
 * 5-star rating widget.
 *
 * Two audiences share the same block: casual visitors see the aggregate
 * average and vote count; signed-in users can vote and see their own vote
 * highlighted. Non-signed-in users still see the aggregate — a click prompts
 * to sign in via the same panel the header uses.
 */

export interface RatingValue {
  avg: number;
  count: number;
  mine: number | null;
}

export function RecipeRating({
  slug,
  value,
  canVote,
  onChange,
  onSignInRequired,
}: {
  slug: string;
  value: RatingValue;
  canVote: boolean;
  onChange: (slug: string, stars: number) => Promise<void>;
  onSignInRequired: () => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const displayed = hover ?? value.mine ?? Math.round(value.avg);

  const activate = async (stars: number) => {
    if (!canVote) {
      onSignInRequired();
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      await onChange(slug, stars);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative z-10 flex items-center gap-2">
      <div
        role="radiogroup"
        aria-label="Rate this recipe"
        className="inline-flex"
        onMouseLeave={() => setHover(null)}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const on = star <= displayed;
          const mine = value.mine === star;
          return (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={value.mine === star}
              aria-label={`Rate ${star} out of 5`}
              disabled={saving}
              onMouseEnter={() => setHover(star)}
              onFocus={() => setHover(star)}
              onBlur={() => setHover(null)}
              onClick={() => void activate(star)}
              /* size-8 = 32px, above the 24px WCAG minimum. Enough for a
                 comfortable tap even at the bottom of a card. */
              className={`flex size-8 items-center justify-center rounded-full text-lg leading-none transition-transform hover:scale-110 disabled:opacity-60
                ${on ? 'text-brand' : 'text-muted/50'}
                ${mine ? 'ring-1 ring-brand' : ''}`}
            >
              <span aria-hidden>{on ? '★' : '☆'}</span>
            </button>
          );
        })}
      </div>

      <span className="text-xs text-muted tabular-nums">
        {value.count === 0
          ? 'No ratings yet'
          : `${value.avg.toFixed(1)} · ${value.count} ${value.count === 1 ? 'rating' : 'ratings'}`}
      </span>
    </div>
  );
}
