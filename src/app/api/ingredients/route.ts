import { NextResponse } from 'next/server';
import { getAllIngredients } from '@/lib/db/queries';
import { getLexicon } from '@/lib/matching/lexicon';
import { suggestIngredients } from '@/lib/matching/normalize';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ingredients            -> the whole catalog
 * GET /api/ingredients?q=chick    -> autocomplete suggestions
 */
export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim();
  const limit = Math.min(Number(searchParams.get('limit')) || 8, 50);

  if (!query) {
    return NextResponse.json({ ingredients: getAllIngredients() });
  }

  return NextResponse.json({ ingredients: suggestIngredients(query, getLexicon(), limit) });
}
