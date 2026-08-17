'use client';

/**
 * The shopper's chosen grocery store, persisted in localStorage.
 *
 * Kept separate from the pantry store because it is a shopping preference
 * rather than kitchen contents, and because it is read by exactly one part of
 * the UI. Same `useSyncExternalStore` shape as the pantry so components
 * subscribe the same way and server rendering stays consistent.
 */

const STORAGE_KEY = 'forkchop.store.v1';

export interface ChosenStore {
  locationId: string;
  /** Store name as the banner brands it, e.g. "Food 4 Less - Highland Center". */
  name: string;
  /** Banner name alone, e.g. "Food 4 Less". */
  banner: string;
  address: string;
}

let cached: ChosenStore | null = null;
let cachedRaw: string | null = null;
const listeners = new Set<() => void>();

export function subscribeToStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  for (const listener of listeners) listener();
}

function parse(raw: string | null): ChosenStore | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ChosenStore>;
    if (typeof value?.locationId !== 'string' || !value.locationId) return null;
    return {
      locationId: value.locationId,
      name: typeof value.name === 'string' ? value.name : '',
      banner: typeof value.banner === 'string' ? value.banner : '',
      address: typeof value.address === 'string' ? value.address : '',
    };
  } catch {
    return null;
  }
}

/**
 * Reads through a cache keyed on the raw string so the snapshot is referentially
 * stable — returning a fresh object each call would make useSyncExternalStore
 * re-render forever.
 */
export function getStoreSnapshot(): ChosenStore | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parse(raw);
  }
  return cached;
}

/** No store on the server — the choice is per-browser. */
export function getStoreServerSnapshot(): ChosenStore | null {
  return null;
}

export function setChosenStore(store: ChosenStore | null): void {
  try {
    if (store) localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private browsing or a full quota — the choice just won't persist.
  }
  cachedRaw = null;
  emit();
}
