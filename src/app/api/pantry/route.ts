import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, requireUser, UnauthorizedError } from '@/lib/supabase/server';
import { getLexicon } from '@/lib/matching/lexicon';
import { resolveIngredient } from '@/lib/matching/normalize';

export const dynamic = 'force-dynamic';

/**
 * The signed-in user's pantry.
 *
 * Mirrors the localStorage pantry used when signed out — same raw strings, same
 * de-duplication — so the UI does not care which one is backing it.
 *
 *   GET    -> { items }                list
 *   POST   -> { item } | { merge: [] } add one, or fold a local pantry in
 *   DELETE -> ?text=...                remove one
 */

const MAX_ITEMS = 200;

const SourceSchema = z.enum(['typed', 'scanned', 'voice']);

const ItemSchema = z.object({
  rawText: z.string().trim().min(1).max(200),
  source: SourceSchema.optional(),
  barcode: z.string().regex(/^\d{8,14}$/).optional(),
});

const PostSchema = z.union([
  z.object({ item: ItemSchema }),
  z.object({ merge: z.array(ItemSchema).max(MAX_ITEMS) }),
]);

function unauthorized() {
  return NextResponse.json({ error: 'You must be signed in to do that.' }, { status: 401 });
}

interface PantryRow {
  raw_text: string;
  ingredient_id: string | null;
  source: string;
  barcode: string | null;
}

/** The client only ever needs the raw strings; the rest is for later phases. */
function toResponse(rows: PantryRow[] | null) {
  const items = rows ?? [];
  return {
    items: items.map((row) => ({
      rawText: row.raw_text,
      ingredientId: row.ingredient_id,
      source: row.source,
      barcode: row.barcode,
    })),
    pantry: items.map((row) => row.raw_text),
  };
}

async function readAll(supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>, userId: string) {
  const { data, error } = await supabase
    .from('pantry_items')
    .select('raw_text, ingredient_id, source, barcode')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return toResponse(data as PantryRow[] | null);
}

export async function GET() {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    if (!supabase) return unauthorized();
    return NextResponse.json(await readAll(supabase, user.id));
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorized();
    return NextResponse.json({ error: 'Could not load your pantry.' }, { status: 500 });
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

    const incoming = 'merge' in parsed.data ? parsed.data.merge : [parsed.data.item];

    // Resolve once at write time so later reads and any future server-side
    // matching do not have to redo it. Unresolvable text is still stored —
    // dropping it would lose something the user deliberately added.
    const lexicon = getLexicon();
    const rows = incoming.map((item) => ({
      user_id: user.id,
      raw_text: item.rawText,
      ingredient_id: resolveIngredient(item.rawText, lexicon).ingredientId,
      source: item.source ?? 'typed',
      barcode: item.barcode ?? null,
    }));

    if (rows.length > 0) {
      // The unique index is on (user_id, lower(raw_text)), which PostgREST
      // cannot name in onConflict, so a duplicate raises 23505. Adding
      // something already present is a no-op, not an error.
      const { error } = await supabase.from('pantry_items').insert(rows);
      if (error && error.code !== '23505') throw error;
    }

    return NextResponse.json(await readAll(supabase, user.id));
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorized();
    return NextResponse.json({ error: 'Could not update your pantry.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const text = searchParams.get('text')?.trim();
  const all = searchParams.get('all') === '1';

  if (!text && !all) {
    return NextResponse.json({ error: 'Expected ?text= or ?all=1' }, { status: 400 });
  }

  try {
    const user = await requireUser();
    const supabase = await createClient();
    if (!supabase) return unauthorized();

    const query = supabase.from('pantry_items').delete().eq('user_id', user.id);
    // ilike with no wildcards is an exact, case-insensitive match — the same
    // comparison the unique index uses.
    const { error } = all ? await query : await query.ilike('raw_text', text!);
    if (error) throw error;

    return NextResponse.json(await readAll(supabase, user.id));
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorized();
    return NextResponse.json({ error: 'Could not update your pantry.' }, { status: 500 });
  }
}
