/**
 * The pantry lives in localStorage so it survives a refresh.
 *
 * Exposed as a `useSyncExternalStore` source rather than restored inside an
 * effect: that gives correct SSR behaviour (the server renders the default,
 * the client swaps in saved state after hydration) with no mismatch warning
 * and no cascading renders, and it keeps two open tabs in step via the
 * `storage` event.
 */

const STORAGE_KEY = 'forkchop.pantry.v1';

export interface PantryState {
  pantry: string[];
  assumeStaples: boolean;
  /** Allergen ids from src/lib/allergens.ts. */
  allergens: string[];
  /** Skip anything unavoidably spicy. */
  avoidSpicy: boolean;
  /** Ingredient ids the user would rather not eat. */
  dislikes: string[];
  /** Slugs of recipes saved to "My Recipes". */
  saved: string[];
}

const DEFAULT_STATE: PantryState = {
  pantry: [],
  assumeStaples: true,
  allergens: [],
  avoidSpicy: false,
  dislikes: [],
  saved: [],
};

/**
 * getSnapshot must return a referentially stable value between changes or
 * React will loop, so the parsed state is cached against the raw string it
 * came from.
 */
let cachedRaw: string | null = null;
let cachedState: PantryState = DEFAULT_STATE;

const listeners = new Set<() => void>();

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((i): i is string => typeof i === 'string') : [];

function parse(raw: string | null): PantryState {
  if (!raw) return DEFAULT_STATE;
  try {
    const parsed = JSON.parse(raw) as Partial<PantryState>;
    return {
      pantry: stringList(parsed.pantry),
      assumeStaples: typeof parsed.assumeStaples === 'boolean' ? parsed.assumeStaples : true,
      allergens: stringList(parsed.allergens),
      avoidSpicy: parsed.avoidSpicy === true,
      dislikes: stringList(parsed.dislikes),
      saved: stringList(parsed.saved),
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  // Another tab writing the same key should update this one too.
  window.addEventListener('storage', onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

export function getSnapshot(): PantryState {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private browsing or blocked storage — fall through to the default.
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedState = parse(raw);
  }
  return cachedState;
}

export function getServerSnapshot(): PantryState {
  return DEFAULT_STATE;
}

export function updatePantryState(update: (current: PantryState) => PantryState): void {
  const next = update(getSnapshot());
  cachedState = next;
  cachedRaw = JSON.stringify(next);
  try {
    localStorage.setItem(STORAGE_KEY, cachedRaw);
  } catch {
    // Nothing persisted, but in-memory state still updates for this session.
  }
  for (const listener of listeners) listener();
}
