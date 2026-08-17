'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Ingredient, MatchStatus, Recipe, RecipeIngredient, RecipeMatch, ResolvedIngredient } from '@/lib/types';
import { getServerSnapshot, getSnapshot, subscribe, updatePantryState } from '@/lib/pantry-store';
import { PantryInput } from './PantryInput';
import { FilterBar } from './FilterBar';
import { AllergyFilter } from './AllergyFilter';
import { DislikesInput } from './DislikesInput';
import { StatsRow } from './StatsRow';
import { PigMascot } from './PigMascot';
import { RecipeCard, STATUS_LABEL } from './RecipeCard';
import { RecipeDetail } from './RecipeDetail';
import { BasketPanel, type BasketItem } from './BasketPanel';
import { SiteHeader, type View } from './SiteHeader';
import { InfiniteScrollSentinel } from './InfiniteScrollSentinel';
import { SavedGroupToggle } from './SavedGroupToggle';
import type { RatingValue } from './RecipeRating';
import { setPantryItems, setSavedRecipes } from '@/lib/pantry-store';
import {
  addSavedRecipe,
  mergeLocalIntoAccount,
  removeSavedRecipe,
} from '@/lib/saved-recipes';
import {
  addPantryItem,
  clearPantry,
  mergeLocalPantry,
  removePantryItem,
  type PantrySource,
} from '@/lib/pantry-sync';
import { FilterSection } from './FilterSection';
import { ChipFilter, type ChipOption } from './ChipFilter';
import { DIETS, MEAL_TYPES, REGIONS } from '@/lib/taxonomy';
import type { Facets } from '@/lib/db/queries';
import type { ProviderSummary } from '@/lib/grocery/types';
import type { FeatureFlags } from '@/lib/flags';
import { PAGE_SIZE, paginateBySection } from '@/lib/pagination';
import { groupSavedRecipes, type SavedGroupBy } from '@/lib/saved-grouping';
import { fetchRatings, saveRating, type RatingsBySlug } from '@/lib/ratings-sync';

interface RecommendationsResponse {
  pantry: ResolvedIngredient[];
  unrecognized: string[];
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

const SECTION_ORDER: MatchStatus[] = ['ready', 'almost', 'stretch'];

const SECTION_BLURB: Record<MatchStatus, string> = {
  ready: 'You have everything you need for these.',
  almost: 'A couple of items short — add them to your basket below.',
  stretch: 'Further off, but they use what you already have.',
};

const SECTION_COLOR: Record<MatchStatus, string> = {
  ready: 'var(--score-high)',
  almost: 'var(--score-mid)',
  stretch: 'var(--brand)',
};

const SECTION_SOFT: Record<MatchStatus, string> = {
  ready: 'var(--score-high-soft)',
  almost: 'var(--score-mid-soft)',
  stretch: 'var(--brand-soft)',
};

export function PantryApp({
  allTags,
  ingredients,
  facets,
  providers,
  userEmail,
  authConfigured,
  authSetupHint,
  flags,
}: {
  allTags: string[];
  ingredients: Ingredient[];
  facets: Facets;
  providers: ProviderSummary[];
  userEmail: string | null;
  authConfigured: boolean;
  authSetupHint: string;
  flags: FeatureFlags;
}) {
  // Persisted across reloads; see src/lib/pantry-store.ts.
  const { pantry, assumeStaples, allergens, avoidSpicy, dislikes, saved } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedDiets, setSelectedDiets] = useState<string[]>([]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedMeals, setSelectedMeals] = useState<string[]>([]);
  const [maxTotalMinutes, setMaxTotalMinutes] = useState<number | null>(null);
  const [view, setView] = useState<View>('discover');
  const [signInOpen, setSignInOpen] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [revealCount, setRevealCount] = useState(PAGE_SIZE);
  const [savedGroupBy, setSavedGroupBy] = useState<SavedGroupBy>('flat');
  const [ratings, setRatings] = useState<RatingsBySlug>({});

  const [data, setData] = useState<RecommendationsResponse | null>(null);
  const [savedMatches, setSavedMatches] = useState<RecipeMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [basket, setBasket] = useState<Map<string, BasketItem>>(new Map());
  /** Lifted so the recipe modal's "Review basket" CTA can open the panel. */
  const [basketOpen, setBasketOpen] = useState(false);
  const [openMatch, setOpenMatch] = useState<RecipeMatch | null>(null);

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

  /**
   * Snapshots of external recipes currently on screen, sent with /api/saved so
   * saved Spoonacular recipes render without another API call.
   */
  const externalSnapshots = useMemo(() => {
    const seen = new Map<string, Recipe>();
    for (const match of [...(data?.matches ?? []), ...savedMatches]) {
      const recipe = match.recipe;
      if ((recipe.sourceId ?? 'local') !== 'local') seen.set(recipe.slug, recipe);
    }
    return [...seen.values()];
  }, [data, savedMatches]);

  // Saved recipes are scored against the pantry but never filtered out — the
  // user asked for these by name, so they always appear.
  useEffect(() => {
    if (view !== 'saved' || saved.length === 0) return;

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
        setError(err instanceof Error ? err.message : 'Something went wrong');
      }
    })();

    return () => controller.abort();
  }, [view, saved, pantry, assumeStaples, externalSnapshots]);

  /**
   * Local write first so the chip appears instantly, then a write-through to
   * the account when signed in. A failed sync surfaces a notice rather than
   * reverting — the item is still valid on this device.
   */
  const addToPantry = useCallback(
    (value: string, source: PantrySource = 'typed', barcode?: string) => {
      const alreadyThere = getSnapshot().pantry.some(
        (item) => item.toLowerCase() === value.toLowerCase(),
      );

      updatePantryState((current) =>
        alreadyThere ? current : { ...current, pantry: [...current.pantry, value] },
      );

      if (alreadyThere || !userEmail) return;

      void (async () => {
        const result = await addPantryItem(value, source, barcode);
        if (result.error) setSyncNotice(result.error);
        else setPantryItems(result.pantry);
      })();
    },
    [userEmail],
  );

  const removeFromPantry = useCallback(
    (value: string) => {
      updatePantryState((current) => ({
        ...current,
        pantry: current.pantry.filter((item) => item !== value),
      }));

      if (!userEmail) return;

      void (async () => {
        const result = await removePantryItem(value);
        if (result.error) setSyncNotice(result.error);
      })();
    },
    [userEmail],
  );

  const clearWholePantry = useCallback(() => {
    updatePantryState((current) => ({ ...current, pantry: [] }));
    if (!userEmail) return;
    void (async () => {
      const result = await clearPantry();
      if (result.error) setSyncNotice(result.error);
    })();
  }, [userEmail]);

  const toggleBasket = useCallback((ingredient: RecipeIngredient, recipeTitle: string) => {
    setBasket((current) => {
      const next = new Map(current);
      const existing = next.get(ingredient.id);

      if (existing) {
        // Second click on the same chip removes it; clicking it from a
        // different recipe just records the extra reason it is needed.
        if (existing.neededFor.includes(recipeTitle)) {
          next.delete(ingredient.id);
          return next;
        }
        next.set(ingredient.id, { ...existing, neededFor: [...existing.neededFor, recipeTitle] });
        return next;
      }

      next.set(ingredient.id, {
        ingredientId: ingredient.id,
        name: ingredient.name,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        category: ingredient.category,
        neededFor: [recipeTitle],
      });
      return next;
    });
  }, []);

  const addAllMissing = useCallback((match: RecipeMatch) => {
    setBasket((current) => {
      const next = new Map(current);
      for (const ingredient of match.missing) {
        const existing = next.get(ingredient.id);
        const neededFor = existing
          ? [...new Set([...existing.neededFor, match.recipe.title])]
          : [match.recipe.title];
        next.set(ingredient.id, {
          ingredientId: ingredient.id,
          name: ingredient.name,
          quantity: ingredient.quantity,
          unit: ingredient.unit,
          category: ingredient.category,
          neededFor,
        });
      }
      return next;
    });
  }, []);

  const basketIds = useMemo(() => new Set(basket.keys()), [basket]);
  const basketItems = useMemo(() => [...basket.values()], [basket]);
  const catalog = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);

  const toggleAllergen = useCallback((id: string) => {
    updatePantryState((current) => ({
      ...current,
      allergens: current.allergens.includes(id)
        ? current.allergens.filter((a) => a !== id)
        : [...current.allergens, id],
    }));
  }, []);

  const addDislike = useCallback((id: string) => {
    updatePantryState((current) =>
      current.dislikes.includes(id)
        ? current
        : { ...current, dislikes: [...current.dislikes, id] },
    );
  }, []);

  const removeDislike = useCallback((id: string) => {
    updatePantryState((current) => ({
      ...current,
      dislikes: current.dislikes.filter((d) => d !== id),
    }));
  }, []);

  /**
   * Optimistic locally, then written through to the account when signed in.
   *
   * The local write happens first either way so the heart responds instantly;
   * a failed sync surfaces a notice rather than silently reverting, since the
   * save is still valid on this device.
   */
  const toggleSaved = useCallback(
    (slug: string, recipe?: Recipe) => {
      const wasSaved = getSnapshot().saved.includes(slug);

      updatePantryState((current) => ({
        ...current,
        saved: wasSaved
          ? current.saved.filter((s) => s !== slug)
          : [...current.saved, slug],
      }));

      if (!userEmail) return;

      void (async () => {
        const result = wasSaved ? await removeSavedRecipe(slug) : await addSavedRecipe(slug, recipe);
        if (result.error) {
          setSyncNotice(result.error);
          return;
        }
        // Adds return the canonical list; deletes do not, to save a round-trip.
        if (result.slugs.length > 0) setSavedRecipes(result.slugs);
      })();
    },
    [userEmail],
  );

  const savedSet = useMemo(() => new Set(saved), [saved]);

  /**
   * On sign-in, fold this browser's saves into the account and adopt the
   * account's list. Runs once per signed-in session, not on every render.
   *
   * Reads the saved list via getSnapshot() rather than closing over `saved`, so
   * this effect does not re-run — and every recipe card does not re-render —
   * each time a heart is toggled.
   */
  const mergedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!userEmail || mergedForRef.current === userEmail) return;
    mergedForRef.current = userEmail;

    void (async () => {
      const [recipes, pantry] = await Promise.all([
        mergeLocalIntoAccount(getSnapshot().saved),
        mergeLocalPantry(getSnapshot().pantry),
      ]);

      if (recipes.error) setSyncNotice(recipes.error);
      setSavedRecipes(recipes.slugs);

      if (pantry.error) setSyncNotice(pantry.error);
      else setPantryItems(pantry.pantry);
    })();
  }, [userEmail]);

  /** Shared toggle for the multi-select chip filters. */
  const toggle = useCallback(
    (setter: React.Dispatch<React.SetStateAction<string[]>>, id: string) => {
      setter((current) =>
        current.includes(id) ? current.filter((v) => v !== id) : [...current, id],
      );
    },
    [],
  );

  /**
   * Filter options, annotated with how many recipes each would match. Options
   * nothing matches are dropped, so nobody picks a filter that can only ever
   * return an empty list.
   */
  const buildOptions = useCallback(
    (
      definitions: readonly { id: string; label: string; emoji: string }[],
      counts: { id: string; count: number }[],
    ): ChipOption[] => {
      const byId = new Map(counts.map((c) => [c.id, c.count]));
      return definitions
        .filter((d) => (byId.get(d.id) ?? 0) > 0)
        .map((d) => ({ id: d.id, label: d.label, emoji: d.emoji, count: byId.get(d.id) }));
    },
    [],
  );

  const dietOptions = useMemo(
    () => buildOptions(DIETS, facets.diets),
    [buildOptions, facets.diets],
  );
  const regionOptions = useMemo(
    () => buildOptions(REGIONS, facets.regions),
    [buildOptions, facets.regions],
  );
  const mealOptions = useMemo(
    () => buildOptions(MEAL_TYPES, facets.mealTypes),
    [buildOptions, facets.mealTypes],
  );

  const sections = useMemo(() => {
    const grouped = new Map<MatchStatus, RecipeMatch[]>();
    for (const match of data?.matches ?? []) {
      const list = grouped.get(match.status) ?? [];
      list.push(match);
      grouped.set(match.status, list);
    }
    return grouped;
  }, [data]);

  /**
   * Ratings load once per result-set change, keyed on the slugs currently on
   * screen (Discover + My Recipes). A separate reducer would over-engineer
   * this — the round-trip is small and only runs when the list mutates.
   */
  const ratingSlugs = useMemo(() => {
    const slugs = new Set<string>();
    for (const m of data?.matches ?? []) slugs.add(m.recipe.slug);
    for (const m of savedMatches) slugs.add(m.recipe.slug);
    return [...slugs];
  }, [data, savedMatches]);

  const ratingsKey = ratingSlugs.join(',');
  useEffect(() => {
    if (!flags.ratings || ratingSlugs.length === 0) return;
    let cancelled = false;
    void (async () => {
      const result = await fetchRatings(ratingSlugs);
      if (!cancelled) setRatings((prev) => ({ ...prev, ...result }));
    })();
    return () => { cancelled = true; };
  }, [flags.ratings, ratingsKey, ratingSlugs]);

  const onRate = useCallback(
    async (slug: string, stars: number) => {
      if (!userEmail) { setSignInOpen(true); return; }
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
    [ratings, userEmail],
  );

  /**
   * Pagination: cap total revealed matches at revealCount, distributed across
   * sections in Ready → Almost → Stretch order so the best matches always
   * appear first. Gated by flags.pagination — off keeps the show-all
   * behaviour intact.
   */
  const pagination = useMemo(
    () => paginateBySection(sections, SECTION_ORDER, revealCount),
    [sections, revealCount],
  );
  const paginated = flags.pagination;

  const savedGroups = useMemo(
    () => (flags.savedGrouping ? groupSavedRecipes(savedMatches, savedGroupBy) : []),
    [flags.savedGrouping, savedMatches, savedGroupBy],
  );
  const visibleSections = paginated ? pagination.visible : sections;
  const hasMore = paginated && pagination.totalShown < pagination.totalAvailable;

  /**
   * A new result set (filters changed, pantry changed) should reveal from the
   * top, not continue paging through the previous list at whatever depth we
   * scrolled to. Uses the officially blessed "reset on prop change" pattern —
   * a setState *in render* rather than in an effect, so React handles it
   * without a paint in between.
   */
  const [dataForReset, setDataForReset] = useState(data);
  if (dataForReset !== data) {
    setDataForReset(data);
    setRevealCount(PAGE_SIZE);
  }

  return (
    <>
    <SiteHeader
      view={view}
      onViewChange={setView}
      savedCount={saved.length}
      userEmail={userEmail}
      authConfigured={authConfigured}
      authSetupHint={authSetupHint}
      signInOpen={signInOpen}
      onSignInOpenChange={setSignInOpen}
      flags={flags}
    />

    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[340px_1fr] lg:py-12">
      {/*
       * Sticky on desktop, and independently scrollable: with pantry, diet,
       * region, meal, allergies, dislikes and style all present, the panel is
       * taller than most viewports, and the bottom has to stay reachable.
       */}
      <aside
        className="lg:sticky lg:top-28 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto lg:overscroll-contain brand-scrollbar"
      >
        <div className="rounded-2xl border border-border bg-surface p-5">
          <PantryInput
            pantry={pantry}
            onAdd={addToPantry}
            onRemove={removeFromPantry}
            onClear={clearWholePantry}
            unrecognized={data?.unrecognized ?? []}
            resolved={data?.pantry ?? []}
          />

          <div className="mt-4 border-t border-border">
            <FilterSection title="Diet" emoji="🥗" badge={selectedDiets.length}>
              <ChipFilter
                options={dietOptions}
                selected={selectedDiets}
                onToggle={(id) => toggle(setSelectedDiets, id)}
                onClear={() => setSelectedDiets([])}
                hint="These stack — pick two and a recipe must satisfy both."
              />
            </FilterSection>

            <FilterSection title="Region" emoji="🌍" badge={selectedRegions.length}>
              <ChipFilter
                options={regionOptions}
                selected={selectedRegions}
                onToggle={(id) => toggle(setSelectedRegions, id)}
                onClear={() => setSelectedRegions([])}
                hint="Pick several to widen the search."
              />
            </FilterSection>

            <FilterSection title="Meal" emoji="🍽️" badge={selectedMeals.length}>
              <ChipFilter
                options={mealOptions}
                selected={selectedMeals}
                onToggle={(id) => toggle(setSelectedMeals, id)}
                onClear={() => setSelectedMeals([])}
              />
            </FilterSection>

            <FilterSection title="Allergies" emoji="⚠️" badge={allergens.length}>
              <AllergyFilter
                selected={allergens}
                onToggle={toggleAllergen}
                onClear={() => updatePantryState((current) => ({ ...current, allergens: [] }))}
              />
            </FilterSection>

            <FilterSection
              title="Dislikes"
              emoji="🚫"
              badge={dislikes.length + (avoidSpicy ? 1 : 0)}
            >
              <DislikesInput
                dislikes={dislikes}
                catalog={catalog}
                onAdd={addDislike}
                onRemove={removeDislike}
                avoidSpicy={avoidSpicy}
                onAvoidSpicyChange={(value) =>
                  updatePantryState((current) => ({ ...current, avoidSpicy: value }))
                }
              />
            </FilterSection>

            <FilterSection
              title="Time &amp; style"
              emoji="⏱️"
              badge={selectedTags.length + (maxTotalMinutes ? 1 : 0)}
              defaultOpen={false}
            >
              <FilterBar
                allTags={allTags}
                selectedTags={selectedTags}
                onToggleTag={(tag) => toggle(setSelectedTags, tag)}
                assumeStaples={assumeStaples}
                onAssumeStaplesChange={(value) =>
                  updatePantryState((current) => ({ ...current, assumeStaples: value }))
                }
                maxTotalMinutes={maxTotalMinutes}
                onMaxTotalMinutesChange={setMaxTotalMinutes}
              />
            </FilterSection>
          </div>
        </div>
      </aside>

      <main className="min-w-0 pb-24">
        {view === 'discover' && pantry.length > 0 && data && data.unrecognized.length > 0 && (
          <div className="mb-6 rounded-xl border border-score-mid bg-score-mid-soft p-4 text-sm text-score-mid">
            <p className="font-medium">
              We don&apos;t recognise {data.unrecognized.map((u) => `"${u}"`).join(', ')} yet.
            </p>
            <p className="mt-1 text-xs">
              They&apos;re not counted in the matches below. Try a simpler name, or a different word
              for the same thing.
            </p>
          </div>
        )}

        {view === 'discover' && (data?.notices?.length ?? 0) > 0 && (
          <div className="mb-6 rounded-xl border border-border bg-surface-muted p-4 text-sm">
            {data!.notices!.map((notice) => (
              <p key={notice} className="text-muted">
                {notice}
              </p>
            ))}
          </div>
        )}

        {error && (
          <div role="alert" className="mb-6 rounded-xl border border-score-mid bg-score-mid-soft p-4 text-sm text-score-mid">
            {error}
          </div>
        )}

        {view === 'saved' && (
          <section>
            <div className="mb-4">
              <h2 className="text-2xl font-extrabold">My Recipes</h2>
              <p className="text-sm text-muted">
                {saved.length === 0
                  ? 'Nothing saved yet.'
                  : `${saved.length} saved recipe${saved.length === 1 ? '' : 's'}, scored against your pantry. Saved recipes always show, whatever your filters say.`}
              </p>
            </div>

            {/*
              Signed out, saves still work — they just live in this browser.
              Prompting rather than gating keeps the feature usable while making
              the benefit of an account concrete.
            */}
            {!userEmail && authConfigured && (
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border-2 border-brand bg-brand-soft p-4">
                <p className="min-w-0 flex-1 text-sm">
                  <span className="font-bold text-brand-strong">Saved on this device only.</span>{' '}
                  <span className="text-muted">
                    Sign in and these come with you to any device.
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => setSignInOpen(true)}
                  className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-strong"
                >
                  Sign in to sync
                </button>
              </div>
            )}

            {syncNotice && (
              <p
                role="status"
                className="mb-4 rounded-xl border border-score-mid bg-score-mid-soft p-3 text-sm text-score-mid"
              >
                {syncNotice}
              </p>
            )}

            {saved.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-brand bg-brand-soft/40 p-10 text-center">
                <div className="flex justify-center">
                  <PigMascot size={80} mood="hungry" />
                </div>
                <h3 className="mt-3 text-lg font-bold">No saved recipes yet</h3>
                <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">
                  Tap the 🤍 on any recipe to keep it here.{' '}
                  {userEmail
                    ? 'Saved recipes are tied to your account, so they follow you between devices.'
                    : 'Saved recipes stay in this browser until you sign in.'}
                </p>
                <button
                  type="button"
                  onClick={() => setView('discover')}
                  className="mt-4 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-strong"
                >
                  Find something to cook
                </button>
              </div>
            ) : (
              <>
                {flags.savedGrouping && (
                  <div className="mb-4">
                    <SavedGroupToggle value={savedGroupBy} onChange={setSavedGroupBy} />
                  </div>
                )}

                {flags.savedGrouping && savedGroupBy !== 'flat' ? (
                  <div className="space-y-8">
                    {savedGroups.map((group) => (
                      <section key={group.id}>
                        <h3 className="mb-3 flex items-center gap-2 text-lg font-bold">
                          {group.emoji && <span aria-hidden>{group.emoji}</span>}
                          {group.label}
                          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-bold text-brand-strong tabular-nums">
                            {group.matches.length}
                          </span>
                        </h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {group.matches.map((match) => (
                            <RecipeCard
                              key={`${group.id}-${match.recipe.id}`}
                              match={match}
                              basket={basketIds}
                              saved={savedSet.has(match.recipe.slug)}
                              onOpen={setOpenMatch}
                              onToggleBasket={toggleBasket}
                              onToggleSaved={toggleSaved}
                            />
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {savedMatches.map((match) => (
                      <RecipeCard
                        key={match.recipe.id}
                        match={match}
                        basket={basketIds}
                        saved={savedSet.has(match.recipe.slug)}
                        onOpen={setOpenMatch}
                        onToggleBasket={toggleBasket}
                        onToggleSaved={toggleSaved}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {view === 'discover' && pantry.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-brand bg-brand-soft/40 p-10 text-center">
            <div className="flex justify-center">
              <PigMascot size={88} mood="hungry" />
            </div>
            <h2 className="mt-3 text-xl font-bold">Start with what you&apos;ve got</h2>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">
              Add a few ingredients and ForkChop will find what you can cook tonight — plus the
              recipes you&apos;re only an ingredient or two away from.
            </p>
          </div>
        )}

        {view === 'discover' && pantry.length > 0 && data && (
          <>
            <StatsRow
              ready={data.counts.ready}
              almost={data.counts.almost}
              searched={data.counts.searched}
              excluded={data.counts.excluded}
              loading={loading}
            />

            {data.unlocks.length > 0 && (
              <div className="mb-6 rounded-2xl border-2 border-brand bg-brand-soft p-4">
                <p className="text-sm font-bold text-brand-strong">
                  🐷 One more thing unlocks more dinners
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {data.unlocks.map((unlock) => (
                    <button
                      key={unlock.ingredient.id}
                      type="button"
                      onClick={() => toggleBasket(unlock.ingredient, unlock.recipes[0])}
                      title={`Unlocks: ${unlock.recipes.join(', ')}`}
                      className={`rounded-full border px-3 py-1 text-xs
                        ${
                          basketIds.has(unlock.ingredient.id)
                            ? 'border-brand bg-brand text-white'
                            : 'border-border bg-surface hover:border-brand hover:text-brand'
                        }`}
                    >
                      {unlock.ingredient.name}
                      <span className="ml-1.5 opacity-70">
                        +{unlock.unlocks} recipe{unlock.unlocks === 1 ? '' : 's'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {data.matches.length === 0 && !loading && (
              <div className="rounded-2xl border-2 border-dashed border-border p-10 text-center">
                <div className="flex justify-center">
                  <PigMascot size={72} mood="sad" />
                </div>
                <h3 className="mt-3 font-bold">No matches with these filters</h3>
                <p className="mt-1.5 text-sm text-muted">
                  {data.counts.excluded > 0
                    ? `${data.counts.excluded} recipes are hidden by your allergy and dislike settings. Try relaxing those, the time limit, or add another ingredient.`
                    : 'Try relaxing the time limit or diet filters, or add another ingredient.'}
                </p>
              </div>
            )}

            <div className="space-y-10">
              {SECTION_ORDER.map((status) => {
                const matches = visibleSections.get(status);
                const totalInStatus = sections.get(status)?.length ?? 0;
                if (!matches || matches.length === 0) return null;

                return (
                  <section key={status}>
                    <div className="mb-3">
                      <h3 className="flex items-center gap-2 text-lg font-bold">
                        <span
                          className="inline-block size-3 rounded-full"
                          style={{ backgroundColor: SECTION_COLOR[status] }}
                          aria-hidden
                        />
                        {STATUS_LABEL[status]}
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
                          style={{
                            backgroundColor: SECTION_SOFT[status],
                            color: SECTION_COLOR[status],
                          }}
                        >
                          {paginated ? `${matches.length}/${totalInStatus}` : matches.length}
                        </span>
                      </h3>
                      <p className="text-sm text-muted">{SECTION_BLURB[status]}</p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {matches.map((match) => (
                        <RecipeCard
                          key={match.recipe.id}
                          match={match}
                          basket={basketIds}
                          saved={savedSet.has(match.recipe.slug)}
                          onOpen={setOpenMatch}
                          onToggleBasket={toggleBasket}
                          onToggleSaved={toggleSaved}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>

            {paginated && (
              <InfiniteScrollSentinel
                onReveal={() => setRevealCount((c) => c + PAGE_SIZE)}
                hasMore={hasMore}
                totalShown={pagination.totalShown}
                totalAvailable={pagination.totalAvailable}
              />
            )}
          </>
        )}
      </main>

      {openMatch && (
        <RecipeDetail
          match={openMatch}
          basket={basketIds}
          saved={savedSet.has(openMatch.recipe.slug)}
          onClose={() => setOpenMatch(null)}
          onToggleBasket={toggleBasket}
          onAddAllMissing={addAllMissing}
          onCheckout={() => {
            // Close the recipe first: the basket sheet and this modal are both
            // z-50 overlays, so leaving both mounted would stack them.
            setOpenMatch(null);
            setBasketOpen(true);
          }}
          onToggleSaved={toggleSaved}
          rating={
            flags.ratings
              ? (ratings[openMatch.recipe.slug] ?? { avg: 0, count: 0, mine: null })
              : null
          }
          canRate={!!userEmail}
          onRate={onRate}
          onSignInRequired={() => setSignInOpen(true)}
        />
      )}

      <BasketPanel
        items={basketItems}
        providers={providers}
        onRemove={(id) =>
          setBasket((current) => {
            const next = new Map(current);
            next.delete(id);
            return next;
          })
        }
        onClear={() => setBasket(new Map())}
        open={basketOpen}
        onOpenChange={setBasketOpen}
      />
    </div>
    </>
  );
}
