import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAllRecipes } from '@/lib/db/queries';
import { getLexicon } from '@/lib/matching/lexicon';
import { resolvePantry } from '@/lib/matching/normalize';
import { isExcluded, matchRecipes, suggestUnlocks } from '@/lib/matching/match';

export const dynamic = 'force-dynamic';

const RequestSchema = z.object({
  /** Free text, as typed: "2 chicken breasts", "olive oil", "tomatos". */
  pantry: z.array(z.string()).max(200),
  assumeStaples: z.boolean().optional(),
  excludeAllergens: z.array(z.string()).max(20).optional(),
  dislikedIngredientIds: z.array(z.string()).max(100).optional(),
  excludeSpicy: z.boolean().optional(),
  tags: z.array(z.string()).max(10).optional(),
  diets: z.array(z.string()).max(10).optional(),
  regions: z.array(z.string()).max(10).optional(),
  mealTypes: z.array(z.string()).max(10).optional(),
  maxTotalMinutes: z.number().int().positive().max(600).optional(),
  maxMissing: z.number().int().min(0).max(20).optional(),
  limit: z.number().int().positive().max(100).optional(),
});

/** POST /api/recommendations — the core endpoint. */
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

  const { pantry, ...options } = parsed.data;

  const resolved = resolvePantry(pantry, getLexicon());
  const recognized = resolved.filter((r) => r.ingredientId !== null);
  // Surfaced back to the user rather than dropped, so "quinoaa" or a genuinely
  // unknown ingredient is visible instead of mysteriously ignored.
  const unrecognized = resolved.filter((r) => r.ingredientId === null).map((r) => r.raw);

  const allRecipes = getAllRecipes();

  const matches = matchRecipes(
    allRecipes,
    recognized.map((r) => r.ingredientId!),
    { ...options, limit: options.limit ?? 40 },
  );

  // Surfaced so a suddenly short list is explainable rather than mysterious.
  const excluded = allRecipes.filter((r) => isExcluded(r, options)).length;

  return NextResponse.json({
    pantry: recognized,
    unrecognized,
    counts: {
      total: matches.length,
      ready: matches.filter((m) => m.status === 'ready').length,
      almost: matches.filter((m) => m.status === 'almost').length,
      searched: allRecipes.length - excluded,
      excluded,
      corpus: allRecipes.length,
    },
    unlocks: suggestUnlocks(matches),
    matches,
  });
}
