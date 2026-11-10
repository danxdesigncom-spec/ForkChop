import { NextResponse } from 'next/server';
import { getAllIngredients } from '@/lib/db/queries';
import { fieldSuggestions, resolveNames } from '@/lib/matching/field-suggestions';
import { getLexicon } from '@/lib/matching/lexicon';

export const dynamic = 'force-dynamic';

/** Spoken phrases per request; a sentence rarely holds more than a handful. */
const MAX_RESOLVE = 20;

/**
 * GET /api/ingredients                      -> the whole catalog
 * GET /api/ingredients?q=chick              -> autocomplete suggestions, plus a
 *                                              "Did you mean" `correction` when
 *                                              nothing matches (null otherwise)
 * GET /api/ingredients?resolve=a&resolve=b  -> catalog names for spoken phrases
 */
export function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const phrases = searchParams.getAll('resolve').map((p) => p.trim()).filter(Boolean);
  if (phrases.length > 0) {
    return NextResponse.json({ resolved: resolveNames(phrases.slice(0, MAX_RESOLVE), getLexicon()) });
  }

  const query = searchParams.get('q')?.trim();
  const limit = Math.min(Number(searchParams.get('limit')) || 8, 50);

  if (!query) {
    return NextResponse.json({ ingredients: getAllIngredients() });
  }

  return NextResponse.json(fieldSuggestions(query, getLexicon(), limit));
}
