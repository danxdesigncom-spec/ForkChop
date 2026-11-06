'use client';

import { Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { NavLink } from '@/lib/nav-links';
import type { Recipe, RecipeIngredient, RecipeMatch } from '@/lib/types';
import { THEME_PREFERENCES } from '@/lib/v2/theme-cookie';
import { useTheme } from '@/lib/v2/theme-preference';
import { AllFiltersSheet } from '@/components/v2/AllFiltersSheet';
import { BasketPanelV2, BasketSheet, type BasketLine, type Fulfilment } from '@/components/v2/BasketPanelV2';
import { Button } from '@/components/v2/Button';
import { ChefPig } from '@/components/v2/ChefPig';
import { EmptyState } from '@/components/v2/EmptyState';
import { FilterPill } from '@/components/v2/FilterPill';
import { FilterOptionList } from '@/components/v2/FilterPopover';
import { HaveChip } from '@/components/v2/HaveChip';
import { IngredientField } from '@/components/v2/IngredientField';
import { MatchBadge } from '@/components/v2/MatchBadge';
import { MatchTabs, tabId, type MatchTab } from '@/components/v2/MatchTabs';
import { MissingChip } from '@/components/v2/MissingChip';
import { Pagination } from '@/components/v2/Pagination';
import { QuickAddChip } from '@/components/v2/QuickAddChip';
import { RecipeCardV2 } from '@/components/v2/RecipeCardV2';
import { SegmentedControl } from '@/components/v2/SegmentedControl';
import { SiteHeaderV2, type View } from '@/components/v2/SiteHeaderV2';
import { StatusTag } from '@/components/v2/StatusTag';
import { UnlockChip } from '@/components/v2/UnlockChip';
import { UnlockStrip } from '@/components/v2/UnlockStrip';
import { YourKitchenList, YourKitchenPopover } from '@/components/v2/YourKitchenPopover';

function ing(name: string): RecipeIngredient {
  return {
    id: name.toLowerCase(),
    name,
    category: 'produce',
    isStaple: false,
    allergens: [],
    isSpicy: false,
    quantity: null,
    unit: null,
    note: null,
    importance: 'core',
  } as RecipeIngredient;
}

function sample(overrides: Partial<Recipe>, coverage: number, missing: string[]): RecipeMatch {
  const recipe: Recipe = {
    id: overrides.slug ?? 'sample',
    slug: 'sample',
    title: 'Sample',
    description: '',
    cuisine: 'Italian',
    region: 'europe',
    mealTypes: ['dinner'],
    diets: [],
    servings: 2,
    prepMinutes: 10,
    cookMinutes: 15,
    totalMinutes: 25,
    difficulty: 'easy',
    emoji: '',
    tags: [],
    instructions: [],
    ingredients: [],
    imageUrl: null,
    ...overrides,
  };
  return {
    recipe,
    score: coverage,
    coverage,
    status: missing.length === 0 ? 'ready' : coverage >= 0.55 ? 'almost' : 'stretch',
    have: [],
    missing: missing.map(ing),
    optionalMissing: [],
    assumedStaples: [],
    usedPantryIds: [],
  };
}

const RECIPES: RecipeMatch[] = [
  sample(
    {
      slug: 'tomato-basil-pasta',
      title: 'Tomato and basil pasta',
      description: 'A quick weeknight pasta with garlic, tomatoes and a handful of basil.',
    },
    0.88,
    ['Basil'],
  ),
  sample(
    {
      slug: 'egg-fried-rice',
      title: 'Egg fried rice',
      description: 'Day-old rice, eggs and spring onions in one pan.',
      cuisine: 'Chinese',
      mealTypes: ['lunch'],
      totalMinutes: 15,
    },
    1,
    [],
  ),
  sample(
    {
      slug: 'shakshuka',
      title: 'Shakshuka',
      description: 'Eggs poached in a spiced tomato and pepper sauce.',
      cuisine: 'Middle Eastern',
      mealTypes: ['breakfast'],
      totalMinutes: 35,
    },
    0.42,
    ['Red pepper', 'Cumin', 'Feta'],
  ),
];

const FILTER_OPTIONS = [
  { value: 'vegetarian', label: 'Vegetarian', count: 14 },
  { value: 'vegan', label: 'Vegan', count: 6 },
  { value: 'gluten-free', label: 'Gluten free', count: 0 },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`gallery-${title}`} className="flex flex-col gap-4 border-t border-border py-8">
      <h2 id={`gallery-${title}`} className="font-display text-2xl font-semibold text-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

export function ComponentGallery({ links }: { links: NavLink[] }) {
  const { theme, setTheme } = useTheme();
  const [view, setView] = useState<View>('discover');
  const [have, setHave] = useState(['Eggs', 'Rice', 'Garlic', 'Tomatoes', 'Onion', 'Pasta', 'Olive oil', 'Spring onions']);
  const [tab, setTab] = useState<MatchTab>('ready');
  const [page, setPage] = useState(1);
  const [diets, setDiets] = useState<string[]>(['vegetarian']);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [basketIds, setBasketIds] = useState<Set<string>>(new Set(['Basil']));
  const [lines, setLines] = useState<BasketLine[]>([
    { id: 'basil', name: 'Basil', forRecipe: 'Tomato and basil pasta', quantity: 1 },
    { id: 'feta', name: 'Feta', forRecipe: 'Shakshuka', quantity: 2 },
  ]);
  const [fulfilment, setFulfilment] = useState<Fulfilment>('pickup');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [unlockAdded, setUnlockAdded] = useState<string | null>(null);

  const add = (raw: string) =>
    setHave((prev) => (prev.some((n) => n.toLowerCase() === raw.toLowerCase()) ? prev : [...prev, raw]));
  const remove = (name: string) => setHave((prev) => prev.filter((n) => n !== name));
  const toggleDiet = (v: string) => setDiets((prev) => (prev.includes(v) ? prev.filter((d) => d !== v) : [...prev, v]));
  const toggleSave = (m: RecipeMatch) =>
    setSaved((prev) => {
      const next = new Set(prev);
      if (next.has(m.recipe.slug)) next.delete(m.recipe.slug);
      else next.add(m.recipe.slug);
      return next;
    });
  const addMissing = (name: string) => setBasketIds((prev) => new Set(prev).add(name));
  const onQuantity = (id: string, quantity: number) =>
    setLines((prev) =>
      quantity <= 0 ? prev.filter((l) => l.id !== id) : prev.map((l) => (l.id === id ? { ...l, quantity } : l)),
    );

  const basketProps = {
    lines,
    onQuantity,
    fulfilment,
    onFulfilment: setFulfilment,
    providerName: 'Kroger',
    storeLabel: 'Sample store',
    onSend: () => {},
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <SiteHeaderV2
        view={view}
        onViewChange={setView}
        savedCount={saved.size}
        userEmail={null}
        onLogIn={() => {}}
        links={links}
        skipTo="gallery"
        search={
          <IngredientField
            compact
            have={have}
            maxChips={3}
            onAdd={add}
            onRemove={remove}
            overflow={
              <YourKitchenPopover
                have={have}
                hiddenCount={have.length - 3}
                onRemove={remove}
                onClearAll={() => setHave([])}
              />
            }
          />
        }
      />

      <main id="gallery" className="mx-auto max-w-6xl px-4 pb-24">
        <div className="flex flex-wrap items-end justify-between gap-4 py-8">
          <div>
            <h1 className="font-display text-4xl font-semibold tracking-tight">v2 components</h1>
            <p className="mt-1 text-muted">Temporary review page. Removed before the redesign goes live.</p>
          </div>
          <div className="w-72">
            <SegmentedControl
              label="Gallery theme"
              options={THEME_PREFERENCES.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))}
              value={theme}
              onChange={setTheme}
            />
          </div>
        </div>

        <Section title="Buttons">
          <Row>
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="icon" aria-label="Add">
              <Plus aria-hidden="true" size={20} />
            </Button>
            <Button disabled disabledReasonId="gallery-disabled-reason">
              Disabled
            </Button>
            <span id="gallery-disabled-reason" className="text-sm text-muted">
              Add something to your basket first.
            </span>
          </Row>
        </Section>

        <Section title="Ingredient field">
          <IngredientField have={have} onAdd={add} onRemove={remove} onScan={() => {}} onSpeak={() => {}} />
          <IngredientField have={[]} onAdd={add} onRemove={remove} onScan={() => {}} onSpeak={() => {}} />
          <YourKitchenList have={have} collapsedCount={4} onRemove={remove} />
        </Section>

        <Section title="Chips and tags">
          <Row>
            <HaveChip name="Eggs" onRemove={() => {}} />
            <QuickAddChip name="Butter" onAdd={add} />
            <MissingChip name="Basil" onAdd={addMissing} />
            <MissingChip name="Feta" inBasket onAdd={addMissing} />
            <UnlockChip name="Lemon" unlocks={3} onAdd={setUnlockAdded} />
            <UnlockChip name="Cream" unlocks={1} onAdd={setUnlockAdded} />
          </Row>
          <Row>
            <StatusTag missingCount={0} />
            <StatusTag missingCount={1} />
            <StatusTag missingCount={3} />
          </Row>
          <Row>
            <MatchBadge coverage={1} missing={[]} />
            <MatchBadge coverage={0.88} missing={['Basil']} />
            <MatchBadge coverage={0.6} missing={['Cumin', 'Feta']} />
            <MatchBadge coverage={0.3} missing={['Red pepper', 'Cumin', 'Feta']} />
          </Row>
          <UnlockStrip
            items={[
              { name: 'Lemon', unlocks: 3 },
              { name: 'Cream', unlocks: 1 },
              { name: 'Parmesan', unlocks: 2 },
            ]}
            onAdd={setUnlockAdded}
          />
          {unlockAdded && <p role="status" className="text-sm text-muted">Added {unlockAdded} (demo only).</p>}
        </Section>

        <Section title="Filters">
          <section aria-label="Filters and sort" className="flex flex-wrap gap-2">
            <FilterPill label="Diet" activeCount={diets.length}>
              <FilterOptionList legend="Diet" options={FILTER_OPTIONS} selected={diets} onToggle={toggleDiet} />
            </FilterPill>
            <FilterPill label="Meal">
              <FilterOptionList
                legend="Meal"
                options={[
                  { value: 'breakfast', label: 'Breakfast', count: 4 },
                  { value: 'dinner', label: 'Dinner', count: 11 },
                ]}
                selected={[]}
                onToggle={() => {}}
              />
            </FilterPill>
            <Button variant="secondary" onClick={() => setFiltersOpen(true)}>
              All filters
            </Button>
          </section>
          <AllFiltersSheet
            open={filtersOpen}
            onClose={() => setFiltersOpen(false)}
            onClearAll={() => setDiets([])}
            resultCount={12}
          >
            <FilterOptionList legend="Diet" options={FILTER_OPTIONS} selected={diets} onToggle={toggleDiet} />
          </AllFiltersSheet>
        </Section>

        <Section title="Tabs, cards and pagination">
          <MatchTabs
            counts={{ ready: 1, almost: 1, all: 3 }}
            selected={tab}
            onSelect={setTab}
            panelId="gallery-panel"
          />
          <div id="gallery-panel" role="tabpanel" aria-labelledby={tabId(tab)} className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {RECIPES.map((m) => (
                <RecipeCardV2
                  key={m.recipe.slug}
                  match={m}
                  saved={saved.has(m.recipe.slug)}
                  onToggleSave={toggleSave}
                  onOpen={() => {}}
                  inBasket={basketIds}
                  onAddMissing={addMissing}
                  headingLevel="h3"
                />
              ))}
            </div>
            <div className="flex max-w-md flex-col gap-3">
              {RECIPES.map((m) => (
                <RecipeCardV2
                  key={m.recipe.slug}
                  match={m}
                  saved={saved.has(m.recipe.slug)}
                  onToggleSave={toggleSave}
                  onOpen={() => {}}
                  inBasket={basketIds}
                  onAddMissing={addMissing}
                  layout="row"
                  headingLevel="h3"
                />
              ))}
            </div>
            <Pagination
              total={21}
              pageSize={6}
              page={page}
              hrefFor={(p) => `?page=${p}`}
              onNavigate={setPage}
            />
          </div>
        </Section>

        <Section title="Basket">
          <div className="grid gap-6 md:grid-cols-2">
            <BasketPanelV2 {...basketProps} />
            <BasketPanelV2 {...basketProps} lines={[]} />
          </div>
          <Row>
            <Button variant="secondary" onClick={() => setSheetOpen(true)}>
              Open basket sheet
            </Button>
          </Row>
          <BasketSheet {...basketProps} open={sheetOpen} onClose={() => setSheetOpen(false)} />
        </Section>

        <Section title="Empty states and chef">
          <Row>
            {(['default', 'happy', 'wink', 'thinking', 'oops'] as const).map((e) => (
              <ChefPig key={e} size={64} expression={e} title={`Chef, ${e}`} />
            ))}
          </Row>
          <EmptyState
            heading="No recipes match yet"
            actions={<Button variant="secondary">Clear filters</Button>}
            headingLevel="h3"
          >
            Try removing a filter or adding another ingredient.
          </EmptyState>
        </Section>
      </main>
    </div>
  );
}
