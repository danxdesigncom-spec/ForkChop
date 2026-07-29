import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAllRecipes } from '@/lib/db/queries';
import type { Recipe } from '@/lib/types';
import { getLexicon } from '@/lib/matching/lexicon';
import { resolvePantry } from '@/lib/matching/normalize';
import { scoreRecipe } from '@/lib/matching/match';

export const dynamic = 'force-dynamic';

const RequestSchema = z.object({
  slugs: z.array(z.string()).max(500),
  pantry: z.array(z.string()).max(200).optional(),
  assumeStaples: z.boolean().optional(),
  /** Snapshots of externally-sourced saved recipes, rendered as-is. */
  snapshots: z.array(z.record(z.string(), z.unknown())).max(500).optional(),
});

/**
 * POST /api/saved — score a specific set of recipes against the pantry.
 *
 * Unlike /api/recommendations this does no filtering at all: a saved recipe is
 * shown whatever the user's pantry, allergies or dislikes say, because they
 * asked for it by name. Allergen warnings are still visible on the recipe
 * itself, so nothing is hidden — only the automatic exclusion is skipped.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { slugs, pantry = [], assumeStaples } = parsed.data;

  if (slugs.length === 0) {
    return NextResponse.json({ matches: [], missingSlugs: [] });
  }

  const resolved = resolvePantry(pantry, getLexicon());
  const pantryIds = new Set(
    resolved.flatMap((r) => (r.ingredientId ? [r.ingredientId] : [])),
  );

  const bySlug = new Map(getAllRecipes().map((r) => [r.slug, r]));

  /**
   * Saved external recipes are rendered from the snapshot stored at save time,
   * never re-fetched. That keeps My Recipes working when the provider is down
   * or the daily quota is spent, and stops a page view costing API points.
   */
  const snapshots = new Map<string, Recipe>();
  for (const snapshot of parsed.data.snapshots ?? []) {
    // Snapshots are user-supplied JSON, so check the fields the matcher relies
    // on rather than trusting the shape.
    if (
      snapshot &&
      typeof snapshot.slug === 'string' &&
      typeof snapshot.title === 'string' &&
      Array.isArray(snapshot.ingredients)
    ) {
      snapshots.set(snapshot.slug, snapshot as unknown as Recipe);
    }
  }

  const matches = slugs
    .flatMap((slug) => {
      const recipe = bySlug.get(slug) ?? snapshots.get(slug);
      return recipe ? [scoreRecipe(recipe, pantryIds, { assumeStaples })] : [];
    })
    .sort((a, b) => b.coverage - a.coverage || a.recipe.title.localeCompare(b.recipe.title));

  // Slugs we can render from neither the corpus nor a snapshot, so the client
  // can prune stale saves.
  const missingSlugs = slugs.filter((slug) => !bySlug.has(slug) && !snapshots.has(slug));

  return NextResponse.json({ matches, missingSlugs });
}
