'use client';

import { useCallback, useMemo, useState } from 'react';
import type { Ingredient, MatchStatus, RecipeMatch } from '@/lib/types';
import { updatePantryState } from '@/lib/pantry-store';
import { PantryInput } from './PantryInput';
import { FilterBar } from './FilterBar';
import { AllergyFilter } from './AllergyFilter';
import { DislikesInput } from './DislikesInput';
import { StatsRow } from './StatsRow';
import { PigMascot } from './PigMascot';
import { RecipeCard, STATUS_LABEL } from './RecipeCard';
import { RecipeDetail } from './RecipeDetail';
import { BasketPanel } from './BasketPanel';
import { SiteHeader, type View } from './SiteHeader';
import { InfiniteScrollSentinel } from './InfiniteScrollSentinel';
import { SavedGroupToggle } from './SavedGroupToggle';
import { FilterSection } from './FilterSection';
import { ChipFilter } from './ChipFilter';
import type { Facets } from '@/lib/db/queries';
import type { ProviderSummary } from '@/lib/grocery/types';
import type { FeatureFlags } from '@/lib/flags';
import { PAGE_SIZE, paginateBySection } from '@/lib/pagination';
import { groupSavedRecipes, type SavedGroupBy } from '@/lib/saved-grouping';
import { usePantry } from '@/hooks/usePantry';
import { useRecipeFilters } from '@/hooks/useRecipeFilters';
import { SECTION_ORDER, useRecommendations, useSavedMatches } from '@/hooks/useRecommendations';
import { useBasket } from '@/hooks/useBasket';
import { useRatings } from '@/hooks/useRatings';

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
  // Logic shared with v2 lives in src/hooks; this component keeps the layout.
  const {
    pantry,
    assumeStaples,
    allergens,
    avoidSpicy,
    dislikes,
    saved,
    savedSet,
    syncNotice,
    addToPantry,
    removeFromPantry,
    clearWholePantry,
    toggleAllergen,
    addDislike,
    removeDislike,
    toggleSaved,
  } = usePantry(userEmail);
  const {
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
    dietOptions,
    regionOptions,
    mealOptions,
  } = useRecipeFilters(facets);
  const [view, setView] = useState<View>('discover');
  const [signInOpen, setSignInOpen] = useState(false);
  const [revealCount, setRevealCount] = useState(PAGE_SIZE);
  const [savedGroupBy, setSavedGroupBy] = useState<SavedGroupBy>('flat');

  const { data, loading, error, setError, sections } = useRecommendations({
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
  });
  const savedMatches = useSavedMatches({
    enabled: view === 'saved',
    saved,
    pantry,
    assumeStaples,
    data,
    onError: setError,
  });

  const { basketIds, basketItems, toggleBasket, addAllMissing, removeFromBasket, clearBasket } = useBasket();
  /** Lifted so the recipe modal's "Review basket" CTA can open the panel. */
  const [basketOpen, setBasketOpen] = useState(false);
  const [openMatch, setOpenMatch] = useState<RecipeMatch | null>(null);

  const catalog = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);

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
   * Ratings load once per result-set change, keyed on the slugs currently on
   * screen (Discover + My Recipes).
   */
  const ratingSlugs = useMemo(() => {
    const slugs = new Set<string>();
    for (const m of data?.matches ?? []) slugs.add(m.recipe.slug);
    for (const m of savedMatches) slugs.add(m.recipe.slug);
    return [...slugs];
  }, [data, savedMatches]);
  const openSignIn = useCallback(() => setSignInOpen(true), []);
  const { ratings, onRate } = useRatings({
    enabled: flags.ratings,
    slugs: ratingSlugs,
    userEmail,
    onSignInRequired: openSignIn,
  });

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
        onRemove={removeFromBasket}
        onClear={clearBasket}
        open={basketOpen}
        onOpenChange={setBasketOpen}
      />
    </div>
    </>
  );
}
