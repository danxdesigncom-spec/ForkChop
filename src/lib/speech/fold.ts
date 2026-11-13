/**
 * Turn spoken items into preview chips for the v2B listening state
 * (docs/redesign/07-ingredient-bar-b.md §5).
 *
 * `splitSpokenItems` (./parse.ts) already splits a transcript on "and", commas
 * and pauses. This adds the two things the preview needs on top:
 *
 *   1. A leading count ("two onions", "3 eggs") is lifted into a quantity, so
 *      the chip reads "Onion ×2" rather than "two onions".
 *   2. Items that resolve to the same ingredient fold into one chip with the
 *      counts summed, so "an onion and two onions" never makes two chips.
 *
 * Resolution itself is injected: the browser asks /api/ingredients?resolve=,
 * the tests pass the real lexicon. The pantry stores names only, so the count
 * is shown in the preview and not saved.
 */

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  couple: 2, dozen: 12,
};

/** "two onions" -> { quantity: 2, phrase: "onions" }. Units ("400g", "2 tins of") stay in the phrase. */
export function liftQuantity(item: string): { quantity: number; phrase: string } {
  const text = item.trim();
  const match = text.match(/^(?:a\s+)?(\d{1,2}|[a-z]+)(?:\s+of)?\s+(.+)$/i);
  if (match) {
    const [, head, rest] = match;
    const n = /^\d+$/.test(head) ? Number(head) : NUMBER_WORDS[head.toLowerCase()];
    if (n && n > 0) return { quantity: n, phrase: rest.trim() };
  }
  return { quantity: 1, phrase: text };
}

export interface SpokenChip {
  /** What gets added: the catalog name when resolved, otherwise what was heard. */
  name: string;
  quantity: number;
  /** False when the phrase didn't map to a known ingredient. */
  known: boolean;
}

/**
 * Fold heard items into chips, in the order first heard. `resolve` returns the
 * catalog name for a phrase, or null.
 */
export function foldSpokenItems(items: string[], resolve: (phrase: string) => string | null): SpokenChip[] {
  const chips: SpokenChip[] = [];
  const byKey = new Map<string, SpokenChip>();
  for (const item of items) {
    const { quantity, phrase } = liftQuantity(item);
    if (!phrase) continue;
    const resolved = resolve(phrase);
    const name = resolved ?? phrase;
    const key = name.toLowerCase();
    const existing = byKey.get(key);
    if (existing) {
      existing.quantity += quantity;
      continue;
    }
    const chip = { name, quantity, known: resolved !== null };
    byKey.set(key, chip);
    chips.push(chip);
  }
  return chips;
}
