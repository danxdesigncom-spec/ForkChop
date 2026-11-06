'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MatchStatus, Recipe, RecipeIngredient, RecipeMatch, ResolvedIngredient } from '@/lib/types';

export interface RecommendationsResponse {
  pantry: ResolvedIngredient[];
  unrecognized: string[];
  /** Close matches for unrecognised entries, to offer as "Did you mean …?". */
  corrections?: { raw: string; ingredientId: string; name: string }[];
  counts: {
    total: number;
    ready: number;
    almost: number;
    searched: number;
    excluded: number;
    corpus: number;
    external: number;
  };
  sourcesUsed?: string[];
  notices?: string[];
  unlocks: { ingredient: RecipeIngredient; unlocks: number; recipes: string[] }[];
  matches: RecipeMatch[];
}

export const SECTION_ORDER: MatchStatus[] = ['ready', 'almost', 'stretch'];

export interface RecommendationQuery {
  pantry: string[];
  assumeStaples: boolean;
  allergens: string[];
  dislikes: string[];
  avoidSpicy: boolean;
  selectedTags: string[];
  selectedDiets: string[];
  selectedRegions: string[];
  selectedMeals: string[];
  maxTotalMinutes: number | null;
}

/**
 * Debounced, abortable POST /api/recommendations. The most recent request
 * wins; earlier in-flight ones are aborted. Also groups the matches into
 * Ready / Almost / Stretch sections.
 */
export function useRecommendations(query: RecommendationQuery) {
  const {
    pantry,
    assumeStaples,
    allergens,
    avoidSpicy,
    dislikes,
    selectedTags,
    selectedDiets,
    selectedRegions,
    selectedMeals,
    maxTotalMinutes,
  } = query;
  const [data, setData] = useState<RecommendationsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Most recent request wins; earlier in-flight ones are aborted.
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Nothing to ask for. Any previous response stays in state but is never
    // rendered, since every results block is gated on a non-empty pantry.
    if (pantry.length === 0) return;

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/recommendations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pantry,
            assumeStaples,
            excludeAllergens: allergens.length > 0 ? allergens : undefined,
            dislikedIngredientIds: dislikes.length > 0 ? dislikes : undefined,
            excludeSpicy: avoidSpicy || undefined,
            tags: selectedTags.length > 0 ? selectedTags : undefined,
            diets: selectedDiets.length > 0 ? selectedDiets : undefined,
            regions: selectedRegions.length > 0 ? selectedRegions : undefined,
            mealTypes: selectedMeals.length > 0 ? selectedMeals : undefined,
            maxTotalMinutes: maxTotalMinutes ?? undefined,
          }),
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Could not fetch recommendations');
        setData(json as RecommendationsResponse);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Something went wrong');
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [
    pantry,
    assumeStaples,
    allergens,
    avoidSpicy,
    dislikes,
    selectedTags,
    selectedDiets,
    selectedRegions,
    selectedMeals,
    maxTotalMinutes,
  ]);

  const sections = useMemo(() => {
    const grouped = new Map<MatchStatus, RecipeMatch[]>();
    for (const match of data?.matches ?? []) {
      const list = grouped.get(match.status) ?? [];
      list.push(match);
      grouped.set(match.status, list);
    }
    return grouped;
  }, [data]);

  return { data, loading, error, setError, sections };
}

/**
 * Saved recipes, scored against the pantry but never filtered out: the user
 * asked for these by name, so they always appear. Fetched only while
 * `enabled` (the My Recipes view). Snapshots of external recipes on screen
 * travel with the request so saved Spoonacular recipes render without
 * another API call.
 */
export function useSavedMatches({
  enabled,
  saved,
  pantry,
  assumeStaples,
  data,
  onError,
}: {
  enabled: boolean;
  saved: string[];
  pantry: string[];
  assumeStaples: boolean;
  data: RecommendationsResponse | null;
  onError: (message: string) => void;
}) {
  const [savedMatches, setSavedMatches] = useState<RecipeMatch[]>([]);

  const externalSnapshots = useMemo(() => {
    const seen = new Map<string, Recipe>();
    for (const match of [...(data?.matches ?? []), ...savedMatches]) {
      const recipe = match.recipe;
      if ((recipe.sourceId ?? 'local') !== 'local') seen.set(recipe.slug, recipe);
    }
    return [...seen.values()];
  }, [data, savedMatches]);

  useEffect(() => {
    if (!enabled || saved.length === 0) return;

    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/saved', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slugs: saved, pantry, assumeStaples, snapshots: externalSnapshots }),
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Could not load your recipes');
        setSavedMatches(json.matches as RecipeMatch[]);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        onError(err instanceof Error ? err.message : 'Something went wrong');
      }
    })();

    return () => controller.abort();
  }, [enabled, saved, pantry, assumeStaples, externalSnapshots, onError]);

  return savedMatches;
}
