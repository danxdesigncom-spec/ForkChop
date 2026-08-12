import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFlags } from '@/lib/flags';
import { getAllIngredients } from '@/lib/db/queries';
import { ContentPageHeader } from '@/components/ContentPageHeader';
import { categoryColor } from '@/lib/theme';

/**
 * Staple ingredients reference.
 *
 * ForkChop assumes a small set of everyday ingredients are always on hand and
 * never reports them as missing. This page makes that assumption public so
 * users understand why "salt" never appears in the "you're missing" list.
 *
 * Sourced live from the ingredient catalog — `staple: true` in
 * src/lib/db/data/ingredients.ts. If a phase adds or removes a staple, this
 * page updates automatically.
 *
 * Gated by NEXT_PUBLIC_FEATURE_STAPLES_PAGE.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Staples — ForkChop',
  description: 'The everyday ingredients ForkChop assumes you already have.',
};

export default function StaplesPage() {
  const flags = getFlags();
  if (!flags.staplesPage) notFound();

  // Only the ingredients flagged as staples in the catalog.
  const staples = getAllIngredients().filter((ingredient) => ingredient.isStaple);

  const byCategory = new Map<string, typeof staples>();
  for (const staple of staples) {
    const list = byCategory.get(staple.category) ?? [];
    list.push(staple);
    byCategory.set(staple.category, list);
  }

  // Category order that reads as a kitchen tour rather than alphabetical.
  const ORDER = ['pantry', 'condiment', 'spice', 'other'];
  const groups = ORDER.flatMap((category) => {
    const items = byCategory.get(category);
    return items?.length ? [{ category, items }] : [];
  });

  return (
    <>
      <ContentPageHeader title="Staples" flags={flags} />

      <main className="mx-auto max-w-3xl px-4 py-8 lg:py-12">
        <article className="space-y-6 text-sm leading-relaxed">
          <header>
            <h1 className="text-3xl font-extrabold">Staples</h1>
            <p className="mt-2 text-muted">
              ForkChop assumes you already have these. They&apos;re never reported as missing from
              a recipe, so a pantry of &ldquo;chicken, rice&rdquo; isn&apos;t penalised for not
              mentioning salt.
            </p>
          </header>

          <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
            <p>
              You can turn this off per search: the &ldquo;I have the basics&rdquo; toggle in the
              filter sidebar. Turn it off and every staple below has to be in your pantry
              explicitly, same as any other ingredient.
            </p>
          </div>

          {groups.map((group) => (
            <section key={group.category}>
              <h2 className="mb-2 text-lg font-bold capitalize">{group.category}</h2>
              <ul className="flex flex-wrap gap-1.5">
                {group.items.map((ingredient) => {
                  const color = categoryColor(ingredient.category);
                  return (
                    <li key={ingredient.id}>
                      <span
                        className="inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium"
                        style={{
                          backgroundColor: color.soft,
                          borderColor: color.fg,
                          color: color.fg,
                        }}
                      >
                        {ingredient.name}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          <section className="rounded-2xl border border-border bg-surface-muted p-4 text-sm">
            <h2 className="mb-1 font-bold">Why this exists</h2>
            <p className="text-muted">
              The core scoring model weights each ingredient by importance (core, normal,
              optional) and stops before it double-counts things a working kitchen already has.
              Salt in every dish would otherwise drown out anything meaningful the pantry says.
            </p>
          </section>
        </article>
      </main>
    </>
  );
}
