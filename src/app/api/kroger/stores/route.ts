import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hasKrogerCredentials, searchKrogerLocations } from '@/lib/grocery/kroger-api';
import { bannerForChain } from '@/lib/grocery/kroger-banners';
import { getFlags } from '@/lib/flags';

export const dynamic = 'force-dynamic';

/**
 * GET /api/kroger/stores?zip=92346 — stores near a zip code, for the picker.
 *
 * Proxied through the server so the Kroger client secret never reaches the
 * browser. Returns the banner alongside each store, because "Food 4 Less -
 * Highland Center" tells a shopper far more than a bare location id.
 */

const ZipSchema = z
  .string()
  .trim()
  .regex(/^\d{5}$/, 'Enter a 5-digit ZIP code.');

export async function GET(request: Request) {
  if (!getFlags().kroger) {
    return NextResponse.json({ error: 'Kroger checkout is disabled.' }, { status: 404 });
  }
  if (!hasKrogerCredentials()) {
    return NextResponse.json(
      { error: 'Store lookup is not configured on this deployment.' },
      { status: 409 },
    );
  }

  const parsed = ZipSchema.safeParse(new URL(request.url).searchParams.get('zip') ?? '');
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid ZIP code.' },
      { status: 400 },
    );
  }

  const locations = await searchKrogerLocations(parsed.data);

  return NextResponse.json({
    stores: locations.map((location) => ({
      locationId: location.locationId,
      name: location.name,
      banner: bannerForChain(location.chain).name,
      address: [location.addressLine1, location.city, location.state, location.zipCode]
        .filter(Boolean)
        .join(', '),
    })),
  });
}
