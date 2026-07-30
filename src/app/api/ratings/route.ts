import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, requireUser, UnauthorizedError } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Recipe ratings.
 *
 *   GET  ?slugs=a,b,c   -> { ratings: { [slug]: { avg, count, mine } } }
 *   POST                -> { slug, stars }         upsert my rating
 *   DELETE ?slug=...    -> remove my rating
 *
 * Reads are public (anon works) via SECURITY DEFINER SQL functions —
 * everyone sees the average and vote count, nobody sees individual votes.
 * Writes require a signed-in user.
 */

const MAX_SLUGS = 200;

const GetSchema = z.object({
  slugs: z.array(z.string().min(1).max(128)).max(MAX_SLUGS),
});

const PostSchema = z.object({
  slug: z.string().min(1).max(128),
  stars: z.number().int().min(1).max(5),
});

function unauthorized() {
  return NextResponse.json({ error: 'You must be signed in to rate a recipe.' }, { status: 401 });
}

interface SummaryRow {
  recipe_slug: string;
  vote_count: number;
  avg_stars: number;
}

interface MineRow {
  recipe_slug: string;
  stars: number;
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get('slugs')?.trim();
  const slugs = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];

  const parsed = GetSchema.safeParse({ slugs });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid slugs' }, { status: 400 });
  }
  if (parsed.data.slugs.length === 0) {
    return NextResponse.json({ ratings: {} });
  }

  const supabase = await createClient();
  // Unconfigured Supabase: return empty ratings so the UI can degrade
  // silently rather than 500ing every card.
  if (!supabase) return NextResponse.json({ ratings: {} });

  try {
    // Aggregate — public via SECURITY DEFINER.
    const { data: summary, error: summaryError } = await supabase
      .rpc('recipe_ratings_summary')
      .in('recipe_slug', parsed.data.slugs);
    if (summaryError) throw summaryError;

    // The caller's own votes, if signed in. `getUser()` returns null for
    // anonymous — no error, just no `mine` values in the response.
    const { data: userData } = await supabase.auth.getUser();
    let mine: MineRow[] = [];
    if (userData.user) {
      const { data: mineData, error: mineError } = await supabase
        .from('recipe_ratings')
        .select('recipe_slug, stars')
        .eq('user_id', userData.user.id)
        .in('recipe_slug', parsed.data.slugs);
      if (mineError) throw mineError;
      mine = mineData ?? [];
    }

    const mineBySlug = new Map(mine.map((row) => [row.recipe_slug, row.stars]));

    const ratings: Record<string, { avg: number; count: number; mine: number | null }> = {};
    for (const slug of parsed.data.slugs) {
      ratings[slug] = { avg: 0, count: 0, mine: mineBySlug.get(slug) ?? null };
    }
    for (const row of (summary ?? []) as SummaryRow[]) {
      const existing = ratings[row.recipe_slug];
      if (existing) {
        existing.avg = row.avg_stars ?? 0;
        existing.count = row.vote_count ?? 0;
      }
    }

    return NextResponse.json({ ratings });
  } catch (error) {
    console.error('[ratings] GET failed:', error);
    return NextResponse.json({ error: 'Could not load ratings.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const user = await requireUser();
    const supabase = await createClient();
    if (!supabase) return unauthorized();

    const { error } = await supabase.from('recipe_ratings').upsert(
      { user_id: user.id, recipe_slug: parsed.data.slug, stars: parsed.data.stars },
      { onConflict: 'user_id,recipe_slug' },
    );
    if (error) throw error;

    // Return the fresh aggregate so the client can update its cache
    // without a follow-up round-trip.
    const { data: agg, error: aggError } = await supabase.rpc('recipe_rating_for', {
      p_recipe_slug: parsed.data.slug,
    });
    if (aggError) throw aggError;

    const row = (agg as { vote_count: number; avg_stars: number }[] | null)?.[0];
    return NextResponse.json({
      slug: parsed.data.slug,
      mine: parsed.data.stars,
      avg: row?.avg_stars ?? parsed.data.stars,
      count: row?.vote_count ?? 1,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorized();
    console.error('[ratings] POST failed:', error);
    return NextResponse.json({ error: 'Could not save your rating.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const slug = new URL(request.url).searchParams.get('slug')?.trim();
  if (!slug) return NextResponse.json({ error: 'Expected ?slug=' }, { status: 400 });

  try {
    const user = await requireUser();
    const supabase = await createClient();
    if (!supabase) return unauthorized();

    const { error } = await supabase
      .from('recipe_ratings')
      .delete()
      .eq('user_id', user.id)
      .eq('recipe_slug', slug);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorized();
    return NextResponse.json({ error: 'Could not remove your rating.' }, { status: 500 });
  }
}
