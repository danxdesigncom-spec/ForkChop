import { requireAdmin } from '@/lib/admin/guard';
import { getAllRecipes } from '@/lib/db/queries';
import { RecipesTable, type AdminRecipeRow } from './RecipesTable';
import { ImportRecipesForm } from './ImportRecipesForm';
import { SpoonacularFetchForm } from './SpoonacularFetchForm';

export const dynamic = 'force-dynamic';

export default async function AdminRecipesPage() {
  await requireAdmin();

  const recipes = getAllRecipes();
  const rows: AdminRecipeRow[] = recipes.map((r) => ({
    slug: r.slug,
    title: r.title,
    emoji: r.emoji,
    cuisine: r.cuisine,
    sourceId: r.sourceId ?? 'local',
    disabled: false,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Recipes</h1>
        <p className="mt-1 text-sm text-muted">
          {rows.length} recipe{rows.length === 1 ? '' : 's'} in the bundled corpus.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Import from JSON</h2>
          <p className="mt-1 text-xs text-muted">
            Upload one recipe object or an array. Validated on the server.
          </p>
          <div className="mt-3">
            <ImportRecipesForm />
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Pull from Spoonacular</h2>
          <p className="mt-1 text-xs text-muted">
            Search Spoonacular by keyword and stage results for review.
          </p>
          <div className="mt-3">
            <SpoonacularFetchForm />
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">All recipes</h2>
        <p className="mt-1 text-xs text-muted">
          Disable/enable buttons wire up now; the flag persists in the follow-up PR.
        </p>
        <div className="mt-3">
          <RecipesTable rows={rows} />
        </div>
      </section>
    </div>
  );
}
