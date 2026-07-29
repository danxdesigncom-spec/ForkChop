import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, requireUser, UnauthorizedError } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * The signed-in user's saved recipes.
 *
 * Storage only — scoring against the pantry stays in /api/saved, which works
 * signed out too. Row-level security means these queries cannot reach another
 * user's rows even if the filters below were wrong.
 *
 *   GET    -> { slugs }                 list
 *   POST   -> { slug } | { merge: [] }  add one, or merge local saves in
 *   DELETE -> ?slug=...                 remove one
 */

const MAX_SAVED = 500;

/**
 * A saved external recipe carries a snapshot of itself. Local recipes do not:
 * they are read from the bundled corpus, so storing a copy would only let the
 * two drift apart.
 */
const SnapshotSchema = z.object({}).passthrough();

const PostSchema = z.union([
  z.object({
    slug: z.string().min(1).max(128),
    sourceId: z.string().min(1).max(32).optional(),
    snapshot: SnapshotSchema.optional(),
  }),
  z.object({ merge: z.array(z.string().min(1).max(128)).max(MAX_SAVED) }),
]);

function unauthorized() {
  return NextResponse.json({ error: 'You must be signed in to do that.' }, { status: 401 });
}

export async function GET() {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    if (!supabase) return unauthorized();

    const { data, error } = await supabase
      .from('saved_recipes')
      .select('recipe_slug, source_id, snapshot')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      slugs: (data ?? []).map((row) => row.recipe_slug),
      saved: data ?? [],
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorized();
    return NextResponse.json({ error: 'Could not load your saved recipes.' }, { status: 500 });
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

    /**
     * Merge is what runs the first time someone signs in: whatever they saved
     * anonymously is folded into the account rather than lost. Upsert with
     * ignoreDuplicates makes it idempotent, so a repeated merge is harmless and
     * anything already saved keeps its original created_at.
     */
    if ('merge' in parsed.data) {
      const unique = [...new Set(parsed.data.merge)];
      if (unique.length > 0) {
        const { error } = await supabase.from('saved_recipes').upsert(
          unique.map((recipe_slug) => ({ user_id: user.id, recipe_slug, source_id: 'local' })),
          { onConflict: 'user_id,recipe_slug', ignoreDuplicates: true },
        );
        if (error) throw error;
      }
    } else {
      const sourceId = parsed.data.sourceId ?? 'local';

      // The database enforces this too, but failing here gives a usable message
      // rather than a constraint violation.
      if (sourceId !== 'local' && !parsed.data.snapshot) {
        return NextResponse.json(
          { error: 'External recipes must be saved with a snapshot.' },
          { status: 400 },
        );
      }

      const { error } = await supabase.from('saved_recipes').upsert(
        {
          user_id: user.id,
          recipe_slug: parsed.data.slug,
          source_id: sourceId,
          snapshot: sourceId === 'local' ? null : parsed.data.snapshot,
        },
        { onConflict: 'user_id,recipe_slug', ignoreDuplicates: true },
      );
      if (error) throw error;
    }

    const { data, error } = await supabase
      .from('saved_recipes')
      .select('recipe_slug, source_id, snapshot')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      slugs: (data ?? []).map((row) => row.recipe_slug),
      saved: data ?? [],
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorized();
    return NextResponse.json({ error: 'Could not save that recipe.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const slug = new URL(request.url).searchParams.get('slug')?.trim();
  if (!slug) {
    return NextResponse.json({ error: 'Expected a ?slug= parameter' }, { status: 400 });
  }

  try {
    const user = await requireUser();
    const supabase = await createClient();
    if (!supabase) return unauthorized();

    const { error } = await supabase
      .from('saved_recipes')
      .delete()
      .eq('user_id', user.id)
      .eq('recipe_slug', slug);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorized();
    return NextResponse.json({ error: 'Could not remove that recipe.' }, { status: 500 });
  }
}
