/**
 * Keeps the pantry in step between the browser and the account.
 *
 * Deliberately the same shape as saved-recipes.ts: signed out, localStorage is
 * the source of truth; signed in, the account is, and whatever was local gets
 * merged in rather than discarded. Someone who builds a pantry then signs up
 * should not watch it empty itself.
 */

export type PantrySource = 'typed' | 'scanned' | 'voice';

export interface PantrySyncResult {
  pantry: string[];
  error: string | null;
}

interface PantryPayload {
  pantry?: unknown;
}

async function readPantry(response: Response): Promise<string[]> {
  const data = (await response.json()) as PantryPayload;
  return Array.isArray(data.pantry)
    ? data.pantry.filter((item): item is string => typeof item === 'string')
    : [];
}

/** Called once when a signed-in session appears. */
export async function mergeLocalPantry(localItems: string[]): Promise<PantrySyncResult> {
  try {
    if (localItems.length === 0) {
      const response = await fetch('/api/pantry');
      if (!response.ok) throw new Error(String(response.status));
      return { pantry: await readPantry(response), error: null };
    }

    const response = await fetch('/api/pantry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merge: localItems.map((rawText) => ({ rawText, source: 'typed' })) }),
    });
    if (!response.ok) throw new Error(String(response.status));
    return { pantry: await readPantry(response), error: null };
  } catch {
    // Keep what is local rather than blanking the kitchen over a network blip.
    return { pantry: localItems, error: 'Could not sync your pantry. Showing this device’s list.' };
  }
}

export async function addPantryItem(
  rawText: string,
  source: PantrySource = 'typed',
  barcode?: string,
): Promise<PantrySyncResult> {
  try {
    const response = await fetch('/api/pantry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: { rawText, source, ...(barcode ? { barcode } : {}) } }),
    });
    if (!response.ok) throw new Error(String(response.status));
    return { pantry: await readPantry(response), error: null };
  } catch {
    return { pantry: [], error: 'Could not save that to your pantry.' };
  }
}

export async function removePantryItem(rawText: string): Promise<PantrySyncResult> {
  try {
    const response = await fetch(`/api/pantry?text=${encodeURIComponent(rawText)}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error(String(response.status));
    return { pantry: await readPantry(response), error: null };
  } catch {
    return { pantry: [], error: 'Could not remove that from your pantry.' };
  }
}

export async function clearPantry(): Promise<PantrySyncResult> {
  try {
    const response = await fetch('/api/pantry?all=1', { method: 'DELETE' });
    if (!response.ok) throw new Error(String(response.status));
    return { pantry: await readPantry(response), error: null };
  } catch {
    return { pantry: [], error: 'Could not clear your pantry.' };
  }
}
