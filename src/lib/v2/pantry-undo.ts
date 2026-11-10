/**
 * Undo for the v2B kitchen (docs/redesign/07-ingredient-bar-b.md §6).
 *
 * Every pantry change made from the ingredient bar or the tray is recorded as
 * a `PantryChange`. The status message under the tray offers Undo for the
 * latest one, which replaces the old "Clear all?" confirmation.
 *
 * Pure functions over the pantry's `string[]`, so order is restored exactly
 * and the logic is testable without React.
 */

export type PantryChange =
  /** Names that were genuinely new (duplicates are never recorded). */
  | { kind: 'add'; names: string[] }
  /** `index` is where the name sat before it was removed. */
  | { kind: 'remove'; name: string; index: number }
  /** The whole pantry as it was before Clear all. */
  | { kind: 'clear'; previous: string[] };

const lower = (s: string) => s.toLowerCase();

/** The pantry with `change` reversed. Never duplicates an entry. */
export function undoPantryChange(pantry: string[], change: PantryChange): string[] {
  switch (change.kind) {
    case 'add': {
      const added = new Set(change.names.map(lower));
      return pantry.filter((item) => !added.has(lower(item)));
    }
    case 'remove': {
      if (pantry.some((item) => lower(item) === lower(change.name))) return pantry;
      const at = Math.max(0, Math.min(change.index, pantry.length));
      return [...pantry.slice(0, at), change.name, ...pantry.slice(at)];
    }
    case 'clear': {
      // Anything added after the clear stays, after the restored items.
      const restored = new Set(change.previous.map(lower));
      return [...change.previous, ...pantry.filter((item) => !restored.has(lower(item)))];
    }
  }
}

/** First words of the status message: "Spinach added.", "3 ingredients added.", "Garlic removed." */
export function describePantryChange(change: PantryChange): string {
  switch (change.kind) {
    case 'add':
      return change.names.length === 1 ? `${change.names[0]} added.` : `${change.names.length} ingredients added.`;
    case 'remove':
      return `${change.name} removed.`;
    case 'clear':
      return 'Your kitchen is cleared.';
  }
}

/** Status message lifetime: it goes at the next pantry change or after this long. */
export const UNDO_TIMEOUT_MS = 8000;
