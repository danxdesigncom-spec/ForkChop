import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  ProviderNotConfiguredError,
  defaultGroceryProviderId,
  disabledGroceryProviderIds,
  getGroceryProvider,
} from '@/lib/grocery';
import { getAllIngredients } from '@/lib/db/queries';
import { getFlags } from '@/lib/flags';

export const dynamic = 'force-dynamic';

const RequestSchema = z.object({
  items: z
    .array(
      z.object({
        ingredientId: z.string().min(1),
        quantity: z.number().nullable().optional(),
        unit: z.string().nullable().optional(),
        neededFor: z.array(z.string()).max(50).optional(),
      }),
    )
    .min(1)
    .max(100),
  provider: z.string().optional(),
});

/**
 * POST /api/cart — turn a list of missing ingredients into a store basket.
 *
 * Returns a `checkoutUrl` for the user to complete themselves. This endpoint
 * never charges anything; see src/lib/grocery/types.ts.
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

  const catalog = new Map(getAllIngredients().map((i) => [i.id, i]));

  const unknown = parsed.data.items.filter((i) => !catalog.has(i.ingredientId));
  if (unknown.length > 0) {
    return NextResponse.json(
      { error: `Unknown ingredient ids: ${unknown.map((i) => i.ingredientId).join(', ')}` },
      { status: 400 },
    );
  }

  const lineItems = parsed.data.items.map((item) => ({
    ingredientId: item.ingredientId,
    name: catalog.get(item.ingredientId)!.name,
    quantity: item.quantity ?? null,
    unit: item.unit ?? null,
    neededFor: item.neededFor ?? [],
  }));

  // Refuse flagged-off providers even if the client asks for one directly.
  // The UI already hides them, but a naive script hitting /api/cart could
  // still address a disabled partner otherwise.
  const requested = parsed.data.provider ?? defaultGroceryProviderId();
  const disabled = new Set(disabledGroceryProviderIds(getFlags()));
  if (disabled.has(requested)) {
    return NextResponse.json(
      { error: `The ${requested} checkout is disabled on this deployment.` },
      { status: 404 },
    );
  }

  try {
    const provider = getGroceryProvider(parsed.data.provider);
    const cart = await provider.createCart(lineItems);
    return NextResponse.json({ cart });
  } catch (error) {
    // A provider without credentials is a configuration state, not a failure —
    // 409 lets the client offer the shopping-list export instead.
    if (error instanceof ProviderNotConfiguredError) {
      return NextResponse.json(
        { error: error.message, setupHint: error.setupHint, configured: false },
        { status: 409 },
      );
    }
    const message = error instanceof Error ? error.message : 'Failed to build cart';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
