'use client';

import { ArrowRight, CookingPot, ListChecks, ShoppingBasket } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Facets } from '@/lib/db/queries';
import type { FeatureFlags } from '@/lib/flags';
import type { ProviderSummary } from '@/lib/grocery/types';
import type { Ingredient, MatchStatus, RecipeIngredient, RecipeMatch } from '@/lib/types';
import { compareMinutes } from '@/lib/format';
import { buildNavLinks } from '@/lib/nav-links';
import { paginateByPage } from '@/lib/pagination';
import { QUICK_ADD } from '@/lib/quick-add';
import { getSpeechProvider } from '@/lib/speech';
import { useClientCapability } from '@/lib/use-client-capability';
import { starterSets } from '@/lib/v2/starter-sets';
import { describePantryChange, undoPantryChange, UNDO_TIMEOUT_MS, type PantryChange } from '@/lib/v2/pantry-undo';
import { useAnnouncer } from '@/hooks/useAnnouncer';
import { useBasket } from '@/hooks/useBasket';
import { useBasketCheckout } from '@/hooks/useBasketCheckout';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { usePantry } from '@/hooks/usePantry';
import { useRatings } from '@/hooks/useRatings';
import { useRecipeFilters } from '@/hooks/useRecipeFilters';
import { SECTION_ORDER, useRecommendations, useSavedMatches } from '@/hooks/useRecommendations';
import { AccountMenu } from '../AccountMenu';
import { BarcodeScanner } from '../BarcodeScanner';
import { RecipeDetail } from '../RecipeDetail';
import { SignInPanel } from '../SignInPanel';
import { StorePicker } from '../StorePicker';
import { VoiceInput } from '../VoiceInput';
import { AllFiltersSheet } from './AllFiltersSheet';
import { BasketPanelV2, BasketSheet, type BasketLine } from './BasketPanelV2';
import { Button } from './Button';
import { ChefPig } from './ChefPig';
import { EmptyState } from './EmptyState';
import { FilterPill } from './FilterPill';
import { FilterOptionList, type FilterOption } from './FilterPopover';
import { IngredientField } from './IngredientField';
import { IngredientFieldB, type IngredientFieldBHandle } from './IngredientFieldB';
import { KitchenTray } from './KitchenTray';
import { MatchTabs, tabId, type MatchTab } from './MatchTabs';
import { Pagination } from './Pagination';
import { QuickAddChip } from './QuickAddChip';
import { RecipeCardV2 } from './RecipeCardV2';
import { SiteHeaderV2, type View } from './SiteHeaderV2';
import { UnlockStrip } from './UnlockStrip';
import { YourKitchenList, YourKitchenPopover } from './YourKitchenPopover';

interface Props {
  allTags: string[];
  ingredients: Ingredient[];
  facets: Facets;
  providers: ProviderSummary[];
  userEmail: string | null;
  authConfigured: boolean;
  authSetupHint: string;
  flags: FeatureFlags;
}

type Sort = 'best' | 'quickest';

const HEADER_CHIPS = 4;
const RESULTS_ID = 'recipes';
const PANEL_ID = 'recipe-results';

const TIME_OPTIONS: FilterOption[] = [
  { value: '15', label: 'Under 15 min' },
  { value: '30', label: 'Under 30 min' },
  { value: '45', label: 'Under 45 min' },
  { value: '60', label: 'Under 1 hour' },
];

function toFilterOptions(list: { id: string; label: string; count?: number }[]): FilterOption[] {
  return list.map((o) => ({ value: o.id, label: o.label, count: o.count }));
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function parsePage(raw: string | null): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/**
 * v2 entry point, rendered by `page.tsx` when the `redesign` flag is on.
 * Same props as v1's PantryApp and the same hooks underneath; only the layout
 * differs. Home is the bare URL; results live at `?page=N`.
 */
export function PantryAppV2({ ingredients, facets, providers, userEmail, authConfigured, authSetupHint, flags }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const onResults = searchParams.has('page');
  const requestedPage = parsePage(searchParams.get('page'));

  const kitchen = usePantry(userEmail);
  const filters = useRecipeFilters(facets);
  const [view, setView] = useState<View>('discover');
  const [signInOpen, setSignInOpen] = useState(false);
  const [openMatch, setOpenMatch] = useState<RecipeMatch | null>(null);
  const [basketSheetOpen, setBasketSheetOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [tabChoice, setTabChoice] = useState<MatchTab | null>(null);
  const [sort, setSort] = useState<Sort>('best');
  const canSpeak = useClientCapability(() => getSpeechProvider() !== null);
  const isMobile = !useMediaQuery('(min-width: 768px)', true);
  const isDesktop = useMediaQuery('(min-width: 1024px)', true);
  const pageSize = isMobile ? 8 : 6;
  const { message, announce } = useAnnouncer();
  /** v2B ingredient bar (docs/redesign/07-ingredient-bar-b.md). Off: the v2 bar, unchanged. */
  const barB = flags.ingredientBarB;
  const fieldRef = useRef<IngredientFieldBHandle>(null);

  const { data, loading, error, setError, sections } = useRecommendations({
    pantry: kitchen.pantry,
    assumeStaples: kitchen.assumeStaples,
    allergens: kitchen.allergens,
    avoidSpicy: kitchen.avoidSpicy,
    dislikes: kitchen.dislikes,
    selectedTags: filters.selectedTags,
    selectedDiets: filters.selectedDiets,
    selectedRegions: filters.selectedRegions,
    selectedMeals: filters.selectedMeals,
    maxTotalMinutes: filters.maxTotalMinutes,
  });
  const savedMatches = useSavedMatches({
    enabled: view === 'saved',
    saved: kitchen.saved,
    pantry: kitchen.pantry,
    assumeStaples: kitchen.assumeStaples,
    data,
    onError: setError,
  });
  const basket = useBasket();
  const checkout = useBasketCheckout(basket.basketItems, providers);

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

  /* ------------------------------------------------------------ URL state */

  const goToPage = useCallback(
    (page: number, mode: 'push' | 'replace' = 'push') => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('page', String(page));
      const href = `${pathname}?${params.toString()}`;
      if (mode === 'push') router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  /** Filters, tabs, sort and ingredients all send the shopper back to page 1. */
  const resetPage = useCallback(() => {
    if (onResults && requestedPage !== 1) goToPage(1, 'replace');
  }, [goToPage, onResults, requestedPage]);

  /* ---------------------------------------------------------- the kitchen */

  const summary = useCallback(
    () => (data ? `${plural(data.counts.total, 'recipe')}, ${data.counts.ready} ready to cook.` : ''),
    [data],
  );
  const pendingAnnouncement = useRef<string | null>(null);
  // Say the result counts once the new results arrive, not with stale numbers.
  useEffect(() => {
    if (!pendingAnnouncement.current || loading || !data) return;
    announce(`${pendingAnnouncement.current} ${summary()}`);
    pendingAnnouncement.current = null;
  }, [data, loading, announce, summary]);

  const addIngredient = useCallback(
    (raw: string, source?: 'typed' | 'scanned' | 'voice', barcode?: string) => {
      kitchen.addToPantry(raw, source, barcode);
      pendingAnnouncement.current = `${raw} added.`;
      resetPage();
    },
    [kitchen, resetPage],
  );
  const removeIngredient = useCallback(
    (name: string) => {
      kitchen.removeFromPantry(name);
      pendingAnnouncement.current = `${name} removed.`;
      if (kitchen.pantry.length === 1) announce(`${name} removed. Your kitchen is empty.`);
      resetPage();
    },
    [kitchen, resetPage, announce],
  );
  const clearKitchen = useCallback(() => {
    kitchen.clearWholePantry();
    announce('All ingredients removed.');
    resetPage();
  }, [kitchen, announce, resetPage]);

  /* ------------------------------------------------- v2B: feedback + undo */

  // The latest change, offered for Undo until the next change or 8 seconds.
  const [lastChange, setLastChange] = useState<{ change: PantryChange; id: number } | null>(null);
  const changeId = useRef(0);
  useEffect(() => {
    if (!lastChange) return;
    const timer = setTimeout(() => setLastChange(null), UNDO_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [lastChange]);

  // Just-added chips get a brand ring for about two seconds.
  const [highlighted, setHighlighted] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (highlighted.size === 0) return;
    const timer = setTimeout(() => setHighlighted(new Set()), 2000);
    return () => clearTimeout(timer);
  }, [highlighted]);

  const record = useCallback((change: PantryChange) => {
    changeId.current += 1;
    setLastChange({ change, id: changeId.current });
  }, []);

  const addNamesB = useCallback(
    (names: string[], source: 'typed' | 'scanned' | 'voice', barcode?: string) => {
      const have = new Set(kitchen.pantry.map((p) => p.toLowerCase()));
      const fresh: string[] = [];
      for (const name of names) {
        if (have.has(name.toLowerCase())) continue;
        have.add(name.toLowerCase());
        fresh.push(name);
        kitchen.addToPantry(name, source, barcode);
      }
      if (fresh.length === 0) {
        announce(names.length === 1 ? `${names[0]} is already in your kitchen.` : 'Those are already in your kitchen.');
        return;
      }
      const change: PantryChange = { kind: 'add', names: fresh };
      record(change);
      setHighlighted(new Set(fresh));
      pendingAnnouncement.current = describePantryChange(change);
      resetPage();
    },
    [kitchen, announce, record, resetPage],
  );

  const removeB = useCallback(
    (name: string) => {
      const index = kitchen.pantry.indexOf(name);
      kitchen.removeFromPantry(name);
      record({ kind: 'remove', name, index });
      if (kitchen.pantry.length === 1) {
        announce(`${name} removed. Your kitchen is empty.`);
        // The tray goes with the last chip, so focus moves to the field.
        requestAnimationFrame(() => fieldRef.current?.focus());
      } else {
        pendingAnnouncement.current = `${name} removed.`;
      }
      resetPage();
    },
    [kitchen, record, announce, resetPage],
  );

  const clearB = useCallback(() => {
    const previous = [...kitchen.pantry];
    if (previous.length === 0) return;
    kitchen.clearWholePantry();
    record({ kind: 'clear', previous });
    announce('All ingredients removed.');
    requestAnimationFrame(() => fieldRef.current?.focus());
    resetPage();
  }, [kitchen, record, announce, resetPage]);

  const undo = useCallback(() => {
    if (!lastChange) return;
    kitchen.restorePantry(undoPantryChange(kitchen.pantry, lastChange.change));
    setLastChange(null);
    pendingAnnouncement.current = 'Undone.';
    resetPage();
  }, [kitchen, lastChange, resetPage]);

  /* --------------------------------------------------------------- basket */

  const basketNames = useMemo(() => new Set(basket.basketItems.map((i) => i.name)), [basket.basketItems]);
  const basketLines: BasketLine[] = basket.basketItems.map((item) => ({
    id: item.ingredientId,
    name: item.name,
    forRecipe: item.neededFor[0],
    quantity: checkout.quantityFor(item.ingredientId),
  }));
  const basketCount = basketLines.reduce((n, l) => n + l.quantity, 0);

  const announceBasket = useCallback(
    (text: string, delta: number) => {
      const next = basket.basketItems.length + delta;
      announce(`${text} ${plural(Math.max(0, next), 'item')}.`);
    },
    [announce, basket.basketItems.length],
  );

  const toggleMissing = useCallback(
    (ingredient: RecipeIngredient, recipeTitle: string) => {
      if (basket.basketIds.has(ingredient.id)) {
        basket.removeFromBasket(ingredient.id);
        announceBasket(`${ingredient.name} removed from basket.`, -1);
      } else {
        basket.addToBasket(ingredient, recipeTitle);
        announceBasket(`${ingredient.name} added to basket.`, 1);
      }
    },
    [basket, announceBasket],
  );

  const onQuantity = useCallback(
    (id: string, quantity: number) => {
      const item = basket.basket.get(id);
      if (quantity <= 0) {
        basket.removeFromBasket(id);
        if (item) announceBasket(`${item.name} removed from basket.`, -1);
        return;
      }
      checkout.setQuantity(id, quantity);
    },
    [basket, checkout, announceBasket],
  );

  /* -------------------------------------------------------------- results */

  const counts = { ready: data?.counts.ready ?? 0, almost: data?.counts.almost ?? 0, all: data?.counts.total ?? 0 };
  const defaultTab: MatchTab = counts.ready > 0 ? 'ready' : 'almost';
  const tab = tabChoice ?? defaultTab;

  // A new kitchen means new defaults: forget the tab the shopper picked.
  const [pantryForTab, setPantryForTab] = useState(kitchen.pantry);
  if (pantryForTab !== kitchen.pantry) {
    setPantryForTab(kitchen.pantry);
    setTabChoice(null);
  }

  const page = useMemo(() => {
    let source: Map<MatchStatus, RecipeMatch[]>;
    let order: readonly MatchStatus[] = SECTION_ORDER;
    if (tab === 'all') source = sections;
    else source = new Map([[tab, sections.get(tab) ?? []]]);
    if (sort === 'quickest') {
      const flat = order.flatMap((s) => source.get(s) ?? []);
      const sorted = [...flat].sort((a, b) => compareMinutes(a.recipe.totalMinutes, b.recipe.totalMinutes));
      source = new Map([['ready', sorted]]);
      order = ['ready'];
    }
    return paginateByPage(source, order, requestedPage, pageSize);
  }, [sections, tab, sort, requestedPage, pageSize]);

  // Keep the URL honest when the page asked for no longer exists.
  useEffect(() => {
    if (onResults && data && page.page !== requestedPage) goToPage(page.page, 'replace');
  }, [onResults, data, page.page, requestedPage, goToPage]);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusResults = useRef(false);
  const onPageChange = useCallback(
    (next: number) => {
      focusResults.current = true;
      goToPage(next);
    },
    [goToPage],
  );
  useEffect(() => {
    if (!focusResults.current) return;
    focusResults.current = false;
    document.getElementById(RESULTS_ID)?.scrollIntoView({ block: 'start' });
    headingRef.current?.focus({ preventScroll: true });
  }, [requestedPage]);

  const selectTab = (next: MatchTab) => {
    setTabChoice(next);
    resetPage();
  };
  const hrefFor = (p: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(p));
    return `${pathname}?${params.toString()}`;
  };

  /* -------------------------------------------------------------- filters */

  const withReset =
    <A extends unknown[]>(fn: (...args: A) => void) =>
    (...args: A) => {
      fn(...args);
      resetPage();
    };
  const activeFilterCount =
    filters.selectedDiets.length +
    filters.selectedMeals.length +
    filters.selectedRegions.length +
    (filters.maxTotalMinutes ? 1 : 0);
  const vegetarianOn = filters.selectedDiets.includes('vegetarian');
  const hasVegetarian = filters.dietOptions.some((o) => o.id === 'vegetarian');

  const filterLists = (
    <>
      <FilterOptionList
        legend="Diet"
        options={toFilterOptions(filters.dietOptions)}
        selected={filters.selectedDiets}
        onToggle={withReset(filters.toggleDiet)}
      />
      <FilterOptionList
        legend="Meal"
        options={toFilterOptions(filters.mealOptions)}
        selected={filters.selectedMeals}
        onToggle={withReset(filters.toggleMeal)}
      />
      <FilterOptionList
        legend="Cuisine"
        options={toFilterOptions(filters.regionOptions)}
        selected={filters.selectedRegions}
        onToggle={withReset(filters.toggleRegion)}
      />
      <FilterOptionList
        legend="Time"
        options={TIME_OPTIONS}
        selected={filters.maxTotalMinutes ? [String(filters.maxTotalMinutes)] : []}
        onToggle={withReset((value: string) =>
          filters.setMaxTotalMinutes(filters.maxTotalMinutes === Number(value) ? null : Number(value)),
        )}
      />
    </>
  );

  const filterBar = (
    <section aria-label="Filters and sort" className="flex items-center gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible">
      <Button variant="secondary" className="shrink-0 md:hidden" onClick={() => setFiltersOpen(true)}>
        All filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
      </Button>
      <div className="hidden items-center gap-2 md:flex md:flex-wrap">
        <FilterPill label="All filters" activeCount={activeFilterCount}>
          <div className="flex flex-col gap-5">{filterLists}</div>
        </FilterPill>
        {hasVegetarian && (
          <button
            type="button"
            aria-pressed={vegetarianOn}
            onClick={withReset(() => filters.toggleDiet('vegetarian'))}
            className={
              vegetarianOn
                ? 'inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-brand bg-brand-soft px-3.5 text-sm font-semibold text-brand-strong'
                : 'inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-surface px-3.5 text-sm font-medium text-foreground hover:border-line-strong'
            }
          >
            Vegetarian
          </button>
        )}
        <FilterPill label="Meal" activeCount={filters.selectedMeals.length}>
          <FilterOptionList
            legend="Meal"
            options={toFilterOptions(filters.mealOptions)}
            selected={filters.selectedMeals}
            onToggle={withReset(filters.toggleMeal)}
          />
        </FilterPill>
        <FilterPill label="Time" activeCount={filters.maxTotalMinutes ? 1 : 0}>
          <FilterOptionList
            legend="Time"
            options={TIME_OPTIONS}
            selected={filters.maxTotalMinutes ? [String(filters.maxTotalMinutes)] : []}
            onToggle={withReset((value: string) =>
              filters.setMaxTotalMinutes(filters.maxTotalMinutes === Number(value) ? null : Number(value)),
            )}
          />
        </FilterPill>
      </div>
      <label className="ml-auto flex shrink-0 items-center gap-2 text-sm text-muted">
        Sort
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as Sort);
            resetPage();
          }}
          className="h-10 rounded-xl border border-border bg-surface px-3 text-sm font-medium text-foreground"
        >
          <option value="best">Best match</option>
          <option value="quickest">Quickest</option>
        </select>
      </label>
    </section>
  );

  /* ----------------------------------------------------------- the field */

  const corrections = data?.corrections ?? [];
  const unrecognised = data?.unrecognized ?? [];
  const fieldMessages = unrecognised.length > 0 && (
    <ul className="mt-2 flex flex-col gap-1.5 text-sm" aria-live="polite">
      {unrecognised.map((raw) => {
        const fix = corrections.find((c) => c.raw === raw);
        return (
          <li key={raw} className="text-radish-text">
            We don&apos;t know &lsquo;{raw}&rsquo; yet.
            {fix && (
              <>
                {' '}Did you mean{' '}
                <button
                  type="button"
                  className="font-semibold text-brand-strong underline underline-offset-2"
                  onClick={() => {
                    kitchen.removeFromPantry(raw);
                    addIngredient(fix.name);
                  }}
                >
                  {fix.name.toLowerCase()}
                </button>
                ?
              </>
            )}
          </li>
        );
      })}
    </ul>
  );

  // Not a live region: the page's single polite region already says it (§6).
  const undoStatus = barB && lastChange && (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[14px] border border-border bg-surface px-4 py-2.5">
      <p className="min-w-0 flex-1 text-[15px] text-foreground">
        <strong className="font-semibold">{describePantryChange(lastChange.change)}</strong>{' '}
        {data && !loading && kitchen.pantry.length > 0 && <span className="text-muted">{summary()}</span>}
      </p>
      <Button variant="secondary" className="min-h-10! px-3.5! text-sm sm:min-h-10!" onClick={undo}>
        Undo
      </Button>
    </div>
  );

  const fieldB = (placement: 'header' | 'hero') => (
    <IngredientFieldB
      ref={fieldRef}
      placement={placement}
      isMobile={isMobile}
      announce={announce}
      onAdd={(name, source, barcode) => addNamesB([name], source, barcode)}
      onAddMany={(names) => addNamesB(names, 'voice')}
    />
  );

  const trayB = (placement: 'bar' | 'inline') => (
    <KitchenTray
      have={kitchen.pantry}
      onRemove={removeB}
      onClearAll={clearB}
      highlighted={highlighted}
      onEmpty={() => fieldRef.current?.focus()}
      isMobile={isMobile}
      placement={placement}
      status={undoStatus}
    />
  );

  const field = (compact: boolean) => barB ? fieldB(compact ? 'header' : 'hero') : (
    <IngredientField
      have={kitchen.pantry}
      onAdd={(raw) => addIngredient(raw)}
      onRemove={removeIngredient}
      onScan={() => setScannerOpen(true)}
      onSpeak={canSpeak ? () => setVoiceOpen((v) => !v) : undefined}
      compact={compact}
      maxChips={compact ? HEADER_CHIPS : undefined}
      overflow={
        compact ? (
          <YourKitchenPopover
            have={kitchen.pantry}
            hiddenCount={kitchen.pantry.length - HEADER_CHIPS}
            onRemove={removeIngredient}
            onClearAll={clearKitchen}
          />
        ) : undefined
      }
      label="What's in your kitchen?"
      placeholder="What's in your kitchen?"
    />
  );

  const quickAdds = QUICK_ADD.filter((item) => !kitchen.pantry.some((p) => p.toLowerCase() === item.toLowerCase()));
  const quickAddRow = quickAdds.length > 0 && (
    <div className="flex flex-wrap gap-2">
      {quickAdds.slice(0, 8).map((name) => (
        <QuickAddChip key={name} name={name} onAdd={(n) => (barB ? addNamesB([n], 'typed') : addIngredient(n))} />
      ))}
    </div>
  );

  /* ---------------------------------------------------------------- views */

  const showResults = (pageNumber = 1) => goToPage(pageNumber);
  const emptyReasonId = 'home-cta-reason';
  const total = data?.counts.total ?? 0;
  const pantryEmpty = kitchen.pantry.length === 0;

  const home = (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 pb-32 pt-10 text-center md:pt-20">
      <ChefPig size={isMobile ? 72 : 96} expression="happy" />
      <h1 className="font-display text-[36px] font-semibold leading-[1.05] tracking-[-0.02em] text-foreground md:text-[76px]">
        Cook what you already have.
      </h1>
      <p className="max-w-xl text-[17px] leading-relaxed text-muted">
        Tell us what&apos;s in your kitchen and we&apos;ll find recipes you can make tonight, and the one or two things that unlock more.
      </p>
      <div className="w-full text-left">
        {field(false)}
        {fieldMessages}
        {!barB && voiceOpen && <div className="mt-3"><VoiceInput onAdd={(v) => addIngredient(v, 'voice')} /></div>}
        {barB && (pantryEmpty ? undoStatus && <div className="mt-3">{undoStatus}</div> : <div className="mt-3">{trayB('inline')}</div>)}
      </div>
      <div className="w-full">{quickAddRow}</div>
      <div className="hidden w-full flex-col items-center gap-2 md:flex">
        <Button
          disabled={pantryEmpty}
          disabledReasonId={emptyReasonId}
          onClick={() => showResults()}
          trailingIcon={<ArrowRight size={20} />}
        >
          Find recipes
        </Button>
      </div>
      <ol className="mt-6 grid w-full gap-4 text-left md:grid-cols-3">
        {[
          { icon: <ListChecks size={22} />, title: 'Add what you have', body: 'Type, scan a barcode or say it. Spelling slips are fine.' },
          { icon: <CookingPot size={22} />, title: 'See what you can cook', body: 'Ready-to-cook recipes first, then the ones you’re close to.' },
          { icon: <ShoppingBasket size={22} />, title: 'Fill the gaps', body: 'Add anything missing to a basket and send it to your store.' },
        ].map((step, i) => (
          <li key={step.title} className="flex flex-col gap-2 rounded-[20px] border border-border bg-surface p-5">
            <span aria-hidden="true" className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
              {step.icon}
            </span>
            <span className="font-mono text-xs text-muted">Step {i + 1}</span>
            <h2 className="font-display text-xl font-semibold text-foreground">{step.title}</h2>
            <p className="text-sm leading-normal text-muted">{step.body}</p>
          </li>
        ))}
      </ol>
      <p id={emptyReasonId} className={pantryEmpty ? 'text-sm text-muted' : 'sr-only'}>
        {pantryEmpty ? 'Add at least one ingredient to see recipes.' : ''}
      </p>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-4 backdrop-blur md:hidden">
        <Button block disabled={pantryEmpty} disabledReasonId={emptyReasonId} onClick={() => showResults()}>
          {pantryEmpty ? 'Show recipes' : `Show ${plural(total, 'recipe')}`}
        </Button>
      </div>
    </div>
  );

  const emptyKitchen = (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <EmptyState heading="Your kitchen's looking empty" headingLevel="h1">
        <p>Add a few things you have and we&apos;ll find something to cook.</p>
      </EmptyState>
      <div className="flex flex-col gap-6">
        {field(false)}
        {undoStatus}
        {quickAddRow}
        {starterSets(ingredients).map((set) => (
          <section key={set.id} aria-labelledby={`starter-${set.id}`} className="flex flex-col gap-2 rounded-[20px] border border-border bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 id={`starter-${set.id}`} className="font-display text-xl font-semibold text-foreground">
                {set.label}
              </h2>
              <Button
                variant="secondary"
                onClick={() => {
                  if (barB) {
                    addNamesB(set.items, 'typed');
                    return;
                  }
                  for (const name of set.items) kitchen.addToPantry(name);
                  announce(`${set.label} added.`);
                }}
              >
                Add all
              </Button>
            </div>
            <p className="text-sm text-muted">{set.items.join(', ')}</p>
          </section>
        ))}
      </div>
    </div>
  );

  const ready = counts.ready;
  const heading =
    ready > 0 ? `You can cook ${plural(ready, 'dinner')} tonight` : `You're close to ${plural(counts.almost, 'dinner')}`;
  const subheading =
    ready > 0
      ? 'Everything here uses only what’s already in your kitchen.'
      : 'Nothing’s fully ready yet. Most need just one or two things.';

  const unlocks = (data?.unlocks ?? []).map((u) => ({ name: u.ingredient.name, unlocks: u.unlocks }));

  const results = (
    <div className="mx-auto flex max-w-6xl gap-8 px-4 pb-32 pt-6 lg:pb-12">
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        {barB ? (
          fieldMessages
        ) : (
          <>
            <p className="text-sm text-muted md:hidden">
              <span className="font-semibold text-foreground">{plural(kitchen.pantry.length, 'ingredient')}</span>
              {' '}in your kitchen
            </p>
            <div className="md:hidden">
              <YourKitchenList have={kitchen.pantry} collapsedCount={6} onRemove={removeIngredient} />
              <div className="mt-3">{field(false)}</div>
              {fieldMessages}
            </div>
            <div className="hidden md:block">{fieldMessages}</div>
            {voiceOpen && <VoiceInput onAdd={(v) => addIngredient(v, 'voice')} />}
          </>
        )}
        {filterBar}
        <div id={RESULTS_ID} className="scroll-mt-24">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="font-display text-[32px] font-semibold leading-tight tracking-[-0.02em] text-foreground max-md:sr-only"
          >
            {data ? heading : 'Finding recipes…'}
          </h1>
          {data && <p className="mt-1 text-muted max-md:sr-only">{subheading}</p>}
        </div>
        {error && (
          <p role="alert" className="rounded-xl bg-blush p-3 text-sm text-radish-text">
            {error}
          </p>
        )}
        {kitchen.syncNotice && (
          <p role="status" className="text-sm text-muted">
            {kitchen.syncNotice}
          </p>
        )}
        {data && (
          <>
            <MatchTabs counts={counts} selected={tab} onSelect={selectTab} panelId={PANEL_ID} />
            {unlocks.length > 0 && (
              <UnlockStrip
                items={unlocks}
                onAdd={(name) => {
                  const unlock = data.unlocks.find((u) => u.ingredient.name === name);
                  if (unlock) toggleMissing(unlock.ingredient, unlock.recipes[0] ?? '');
                }}
              />
            )}
            <div id={PANEL_ID} role="tabpanel" aria-labelledby={tabId(tab)} aria-busy={loading} className="flex flex-col gap-6">
              {page.total === 0 ? (
                <EmptyState heading={tab === 'ready' ? 'Nothing ready yet' : 'No recipes here'} headingLevel="h2">
                  <p>
                    {data.counts.excluded > 0
                      ? `${plural(data.counts.excluded, 'recipe')} are hidden by your allergy and dislike settings. Try relaxing those, the time limit, or add another ingredient.`
                      : 'Try another tab, remove a filter or add another ingredient.'}
                  </p>
                </EmptyState>
              ) : (
                <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {page.visible.map((match) => (
                    <li key={match.recipe.slug}>
                      <RecipeCardV2
                        match={match}
                        saved={kitchen.savedSet.has(match.recipe.slug)}
                        onToggleSave={(m) => kitchen.toggleSaved(m.recipe.slug, m.recipe)}
                        onOpen={setOpenMatch}
                        inBasket={basketNames}
                        onAddMissing={(name, m) => {
                          const ing = m.missing.find((i) => i.name === name);
                          if (ing) toggleMissing(ing, m.recipe.title);
                        }}
                        layout={isMobile ? 'row' : 'card'}
                      />
                    </li>
                  ))}
                </ul>
              )}
              <Pagination total={page.total} pageSize={pageSize} page={page.page} hrefFor={hrefFor} onNavigate={onPageChange} />
            </div>
          </>
        )}
      </div>
      {isDesktop && (
        <BasketPanelV2
          lines={basketLines}
          onQuantity={onQuantity}
          fulfilment={checkout.fulfilment}
          onFulfilment={checkout.chooseFulfilment}
          providerName={checkout.provider?.name ?? 'your store'}
          storeLabel={checkout.store ? `${checkout.provider?.name ?? 'Store'} · ${checkout.store.name}` : undefined}
          storeSlot={checkout.provider?.id === 'kroger' ? <StorePicker chosen={checkout.store} onChoose={checkout.chooseStore} /> : undefined}
          onSend={() => void checkout.send()}
          sending={checkout.sending}
          error={checkout.error}
        />
      )}
    </div>
  );

  const saved = (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 pb-32 pt-6">
      <h1 id={RESULTS_ID} className="font-display text-[32px] font-semibold tracking-[-0.02em] text-foreground">
        My Recipes
      </h1>
      {kitchen.saved.length === 0 ? (
        <EmptyState heading="Nothing saved yet" expression="wink">
          <p>Save any recipe to keep it here.</p>
        </EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {savedMatches.map((match) => (
            <li key={match.recipe.slug}>
              <RecipeCardV2
                match={match}
                saved
                onToggleSave={(m) => kitchen.toggleSaved(m.recipe.slug, m.recipe)}
                onOpen={setOpenMatch}
                inBasket={basketNames}
                onAddMissing={(name, m) => {
                  const ing = m.missing.find((i) => i.name === name);
                  if (ing) toggleMissing(ing, m.recipe.title);
                }}
                layout={isMobile ? 'row' : 'card'}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  let body: ReactNode;
  if (view === 'saved') body = saved;
  else if (!onResults) body = home;
  else if (pantryEmpty) body = emptyKitchen;
  else body = results;

  const showBasketBar = !isDesktop && (onResults || view === 'saved') && basketLines.length > 0;

  return (
    <div className="min-h-dvh bg-background text-foreground [scroll-padding-bottom:96px]">
      <SiteHeaderV2
        view={view}
        onViewChange={setView}
        savedCount={kitchen.saved.length}
        userEmail={userEmail}
        onLogIn={() => setSignInOpen(true)}
        account={userEmail ? <AccountMenu email={userEmail} /> : undefined}
        links={buildNavLinks(flags)}
        search={onResults && !pantryEmpty && view === 'discover' ? field(true) : undefined}
        skipTo={RESULTS_ID}
        searchEverywhere={barB}
      />
      {barB && view === 'discover' && onResults && !pantryEmpty && trayB('bar')}
      <main>{body}</main>

      {showBasketBar && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3 backdrop-blur">
          <button
            type="button"
            onClick={() => setBasketSheetOpen(true)}
            className="flex min-h-12 w-full items-center justify-between rounded-xl bg-brand px-4 text-[15px] font-semibold text-on-brand"
          >
            <span>{plural(basketCount, 'item')} in basket</span>
            <span className="inline-flex items-center gap-1">
              Review <ArrowRight aria-hidden="true" size={18} />
            </span>
          </button>
        </div>
      )}

      {!isDesktop && (
        <BasketSheet
          open={basketSheetOpen}
          onClose={() => setBasketSheetOpen(false)}
          lines={basketLines}
          onQuantity={onQuantity}
          fulfilment={checkout.fulfilment}
          onFulfilment={checkout.chooseFulfilment}
          providerName={checkout.provider?.name ?? 'your store'}
          storeLabel={checkout.store ? `${checkout.provider?.name ?? 'Store'} · ${checkout.store.name}` : undefined}
          storeSlot={checkout.provider?.id === 'kroger' ? <StorePicker chosen={checkout.store} onChoose={checkout.chooseStore} /> : undefined}
          onSend={() => void checkout.send()}
          sending={checkout.sending}
          error={checkout.error}
        />
      )}

      <AllFiltersSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onClearAll={withReset(filters.clearAll)}
        resultCount={data?.counts.total ?? 0}
      >
        {filterLists}
      </AllFiltersSheet>

      {scannerOpen && (
        <BarcodeScanner onClose={() => setScannerOpen(false)} onAdd={(value, barcode) => addIngredient(value, 'scanned', barcode)} />
      )}

      {openMatch && (
        <RecipeDetail
          match={openMatch}
          basket={basket.basketIds}
          saved={kitchen.savedSet.has(openMatch.recipe.slug)}
          onClose={() => setOpenMatch(null)}
          onToggleBasket={basket.toggleBasket}
          onAddAllMissing={basket.addAllMissing}
          onCheckout={() => {
            setOpenMatch(null);
            if (!isDesktop) setBasketSheetOpen(true);
          }}
          onToggleSaved={kitchen.toggleSaved}
          rating={flags.ratings ? (ratings[openMatch.recipe.slug] ?? { avg: 0, count: 0, mine: null }) : null}
          canRate={Boolean(userEmail)}
          onRate={onRate}
          onSignInRequired={openSignIn}
        />
      )}

      {signInOpen && (
        <SignInPanel configured={authConfigured} setupHint={authSetupHint} onClose={() => setSignInOpen(false)} />
      )}

      <div aria-live="polite" role="status" className="sr-only">
        {message}
      </div>
    </div>
  );
}
