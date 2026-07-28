import { NextResponse } from 'next/server';
import { getRecipeBySlug } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const recipe = getRecipeBySlug(slug);

  if (!recipe) {
    return NextResponse.json({ error: `No recipe with slug "${slug}"` }, { status: 404 });
  }

  return NextResponse.json({ recipe });
}
