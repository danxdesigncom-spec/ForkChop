'use client';

import { useCallback, useMemo, useState } from 'react';
import type { Facets } from '@/lib/db/queries';
import { DIETS, MEAL_TYPES, REGIONS } from '@/lib/taxonomy';

export interface FilterChoice {
  id: string;
  label: string;
  emoji: string;
  count?: number;
}

/**
 * Filter options, annotated with how many recipes each would match. Options
 * nothing matches are dropped, so nobody picks a filter that can only ever
 * return an empty list.
 */
function buildOptions(
  definitions: readonly { id: string; label: string; emoji: string }[],
  counts: { id: string; count: number }[],
): FilterChoice[] {
  const byId = new Map(counts.map((c) => [c.id, c.count]));
  return definitions
    .filter((d) => (byId.get(d.id) ?? 0) > 0)
    .map((d) => ({ id: d.id, label: d.label, emoji: d.emoji, count: byId.get(d.id) }));
}

function toggleIn(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((v) => v !== id) : [...list, id];
}

/** Tag, diet, region, meal and time filters, plus their options and facet counts. */
export function useRecipeFilters(facets: Facets) {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedDiets, setSelectedDiets] = useState<string[]>([]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedMeals, setSelectedMeals] = useState<string[]>([]);
  const [maxTotalMinutes, setMaxTotalMinutes] = useState<number | null>(null);

  const toggleTag = useCallback((id: string) => setSelectedTags((c) => toggleIn(c, id)), []);
  const toggleDiet = useCallback((id: string) => setSelectedDiets((c) => toggleIn(c, id)), []);
  const toggleRegion = useCallback((id: string) => setSelectedRegions((c) => toggleIn(c, id)), []);
  const toggleMeal = useCallback((id: string) => setSelectedMeals((c) => toggleIn(c, id)), []);

  const clearAll = useCallback(() => {
    setSelectedTags([]);
    setSelectedDiets([]);
    setSelectedRegions([]);
    setSelectedMeals([]);
    setMaxTotalMinutes(null);
  }, []);

  const dietOptions = useMemo(() => buildOptions(DIETS, facets.diets), [facets.diets]);
  const regionOptions = useMemo(() => buildOptions(REGIONS, facets.regions), [facets.regions]);
  const mealOptions = useMemo(() => buildOptions(MEAL_TYPES, facets.mealTypes), [facets.mealTypes]);

  return {
    selectedTags,
    selectedDiets,
    selectedRegions,
    selectedMeals,
    maxTotalMinutes,
    setSelectedTags,
    setSelectedDiets,
    setSelectedRegions,
    setSelectedMeals,
    setMaxTotalMinutes,
    toggleTag,
    toggleDiet,
    toggleRegion,
    toggleMeal,
    clearAll,
    dietOptions,
    regionOptions,
    mealOptions,
  };
}

export type RecipeFilters = ReturnType<typeof useRecipeFilters>;
