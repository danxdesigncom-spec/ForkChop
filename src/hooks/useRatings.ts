'use client';

import { useCallback, useEffect, useState } from 'react';
import type { RatingValue } from '@/components/RecipeRating';
import { fetchRatings, saveRating, type RatingsBySlug } from '@/lib/ratings-sync';

/**
 * Ratings load once per result-set change, keyed on the slugs currently on
 * screen. `onRate` is optimistic; signed-out shoppers are sent to sign in.
 */
export function useRatings({
  enabled,
  slugs,
  userEmail,
  onSignInRequired,
}: {
  enabled: boolean;
  slugs: string[];
  userEmail: string | null;
  onSignInRequired: () => void;
}) {
  const [ratings, setRatings] = useState<RatingsBySlug>({});

  const key = slugs.join(',');
  useEffect(() => {
    if (!enabled || slugs.length === 0) return;
    let cancelled = false;
    void (async () => {
      const result = await fetchRatings(slugs);
      if (!cancelled) setRatings((prev) => ({ ...prev, ...result }));
    })();
    return () => { cancelled = true; };
  }, [enabled, key, slugs]);

  const onRate = useCallback(
    async (slug: string, stars: number) => {
      if (!userEmail) { onSignInRequired(); return; }
      const optimistic: RatingValue = ratings[slug]
        ? { avg: ratings[slug].avg, count: ratings[slug].count, mine: stars }
        : { avg: stars, count: 1, mine: stars };
      setRatings((prev) => ({ ...prev, [slug]: optimistic }));
      const fresh = await saveRating(slug, stars);
      if (fresh) setRatings((prev) => ({ ...prev, [slug]: fresh }));
      // On failure, keep the optimistic value visible for this session; a
      // reload will fetch the true state. The user-facing cost of pretending
      // the save worked is smaller than a stars-flicker.
    },
    [ratings, userEmail, onSignInRequired],
  );

  return { ratings, onRate };
}
