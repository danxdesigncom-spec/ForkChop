import { getAllIngredients, getAllTags, getFacets } from '@/lib/db/queries';
import { describeGroceryProviders } from '@/lib/grocery';
import { getUser } from '@/lib/supabase/server';
import { SUPABASE_SETUP_HINT, isSupabaseConfigured } from '@/lib/supabase/config';
import { getFlags } from '@/lib/flags';
import { PantryApp } from '@/components/PantryApp';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const tags = getAllTags();
  // Passed to the client so dislike chips can show names without another fetch.
  const ingredients = getAllIngredients();
  // Counts behind each filter option, so the UI can hide dead ends.
  const facets = getFacets();
  // Read once per request and passed through so client and server agree.
  const flagsForProviders = getFlags();
  // Which storefronts exist and which are actually connected. Flagged-off
  // providers (e.g. Walmart when NEXT_PUBLIC_FEATURE_WALMART=false) are
  // dropped here so the picker never shows them.
  const providers = describeGroceryProviders({
    hiddenIds: flagsForProviders.walmart ? [] : ['walmart'],
  });
  // Resolved server-side so the header renders signed-in on first paint,
  // rather than flashing "Log in" and then swapping.
  const user = await getUser();
  const flags = flagsForProviders;

  return (
    <>
      {/* The header lives inside PantryApp: its nav drives the same view state. */}
      <PantryApp
        allTags={tags}
        ingredients={ingredients}
        facets={facets}
        providers={providers}
        userEmail={user?.email ?? null}
        authConfigured={isSupabaseConfigured()}
        authSetupHint={SUPABASE_SETUP_HINT}
        flags={flags}
      />

      <footer className="border-t border-border px-4 py-6 text-center text-xs text-muted">
        <p>ForkChop builds your basket and hands off to the store — it never takes payment details.</p>
        {(flags.aboutPage || flags.privacyPage || flags.staplesPage) && (
          <p className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
            {flags.aboutPage && (
              <a href="/about" className="text-brand hover:underline">
                About
              </a>
            )}
            {flags.staplesPage && (
              <a href="/staples" className="text-brand hover:underline">
                Staples
              </a>
            )}
            {flags.privacyPage && (
              <a href="/privacy" className="text-brand hover:underline">
                Privacy policy
              </a>
            )}
          </p>
        )}
      </footer>
    </>
  );
}
