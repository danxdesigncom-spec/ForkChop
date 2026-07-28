import { getAllIngredients, getAllTags, getFacets } from '@/lib/db/queries';
import { describeGroceryProviders } from '@/lib/grocery';
import { PantryApp } from '@/components/PantryApp';

export const dynamic = 'force-dynamic';

export default function Home() {
  const tags = getAllTags();
  // Passed to the client so dislike chips can show names without another fetch.
  const ingredients = getAllIngredients();
  // Counts behind each filter option, so the UI can hide dead ends.
  const facets = getFacets();
  // Which storefronts exist and which are actually connected.
  const providers = describeGroceryProviders();

  return (
    <>
      {/* The header lives inside PantryApp: its nav drives the same view state. */}
      <PantryApp
        allTags={tags}
        ingredients={ingredients}
        facets={facets}
        providers={providers}
      />

      <footer className="border-t border-border px-4 py-6 text-center text-xs text-muted print:hidden">
        ForkChop builds your basket and hands off to the store — it never takes payment details.
      </footer>
    </>
  );
}
