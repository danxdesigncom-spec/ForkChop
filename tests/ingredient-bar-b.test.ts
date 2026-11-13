import { describe, expect, it } from 'vitest';
import { INGREDIENTS } from '@/lib/db/data/ingredients';
import { fieldSuggestions } from '@/lib/matching/field-suggestions';
import { buildLexicon, resolveIngredient } from '@/lib/matching/normalize';
import { foldSpokenItems, liftQuantity } from '@/lib/speech/fold';
import { splitSpokenItems } from '@/lib/speech/parse';
import type { Ingredient } from '@/lib/types';
import { layoutTray, rowsUsed } from '@/lib/v2/kitchen-tray';
import { describePantryChange, undoPantryChange, type PantryChange } from '@/lib/v2/pantry-undo';

/** Phase 7, ingredient bar version B: docs/redesign/07-ingredient-bar-b.md §9. */

const ingredients: Ingredient[] = INGREDIENTS.map((i) => ({
  id: i.id,
  name: i.name,
  category: i.category,
  isStaple: i.staple ?? false,
  allergens: i.allergens ?? [],
  isSpicy: i.spicy ?? false,
}));
const aliases = new Map<string, string>();
for (const ing of INGREDIENTS) {
  aliases.set(ing.name.toLowerCase(), ing.id);
  for (const alias of ing.aliases ?? []) aliases.set(alias.toLowerCase(), ing.id);
}
const lexicon = buildLexicon(ingredients, aliases);

describe('kitchen tray: 2-row cap and "Show all N"', () => {
  const opts = { width: 300, gap: 8, rows: 2, moreWidth: 90 };

  it('counts wrapped rows like flex-wrap', () => {
    expect(rowsUsed([], 300, 8)).toBe(0);
    expect(rowsUsed([100, 100], 300, 8)).toBe(1);
    expect(rowsUsed([100, 100, 100], 300, 8)).toBe(2); // 316 > 300
    // An item wider than the row still takes exactly one row.
    expect(rowsUsed([400, 50], 300, 8)).toBe(2);
  });

  it('shows everything when it fits in two rows', () => {
    expect(layoutTray([100, 100, 100, 100], opts)).toEqual({ visible: 4, hidden: 0 });
  });

  it('drops chips from the end until "Show all N" fits on row two', () => {
    // Row 1: 100 + 100; row 2: 100 + 100 would fit, but not with a 90px button.
    const layout = layoutTray([100, 100, 100, 100, 100, 100], opts);
    expect(layout).toEqual({ visible: 3, hidden: 3 });
    expect(layout.visible + layout.hidden).toBe(6);
    expect(rowsUsed([100, 100, 100, 90], 300, 8)).toBeLessThanOrEqual(2);
  });

  it('handles 24 ingredients and unmeasured trays', () => {
    const widths = Array.from({ length: 24 }, () => 80);
    const { visible, hidden } = layoutTray(widths, { ...opts, width: 900 });
    expect(visible + hidden).toBe(24);
    expect(hidden).toBeGreaterThan(0);
    expect(rowsUsed([...widths.slice(0, visible), 90], 900, 8)).toBeLessThanOrEqual(2);
    expect(layoutTray(widths, { ...opts, width: 0 })).toEqual({ visible: 24, hidden: 0 });
  });
});

describe('pantry undo', () => {
  const pantry = ['Eggs', 'Onion', 'Garlic'];

  it('add -> undo removes only what was added', () => {
    const after = [...pantry, 'Spinach'];
    const change: PantryChange = { kind: 'add', names: ['Spinach'] };
    expect(undoPantryChange(after, change)).toEqual(pantry);
    expect(describePantryChange(change)).toBe('Spinach added.');
    expect(describePantryChange({ kind: 'add', names: ['Onion', 'Rice'] })).toBe('2 ingredients added.');
  });

  it('remove -> undo puts the item back where it was', () => {
    const change: PantryChange = { kind: 'remove', name: 'Onion', index: 1 };
    expect(undoPantryChange(['Eggs', 'Garlic'], change)).toEqual(pantry);
    // Already back (e.g. re-typed): no duplicate.
    expect(undoPantryChange(pantry, change)).toEqual(pantry);
  });

  it('clear all -> undo restores the original order', () => {
    const change: PantryChange = { kind: 'clear', previous: pantry };
    expect(undoPantryChange([], change)).toEqual(pantry);
    // Anything added since the clear is kept, after the restored items.
    expect(undoPantryChange(['Rice', 'garlic'], change)).toEqual([...pantry, 'Rice']);
  });
});

describe('voice parsing for preview chips', () => {
  const resolve = (phrase: string) => resolveIngredient(phrase, lexicon).name;

  it('"two onions, some garlic and a tin of chopped tomatoes"', () => {
    const items = splitSpokenItems('two onions, some garlic and a tin of chopped tomatoes');
    expect(foldSpokenItems(items, resolve)).toEqual([
      { name: 'Onion', quantity: 2, known: true },
      { name: 'Garlic', quantity: 1, known: true },
      { name: 'Chopped tomatoes', quantity: 1, known: true },
    ]);
  });

  it('folds repeats into one chip instead of duplicating', () => {
    const items = splitSpokenItems('an onion and two onions and eggs');
    expect(foldSpokenItems(items, resolve)).toEqual([
      { name: 'Onion', quantity: 3, known: true },
      { name: 'Egg', quantity: 1, known: true },
    ]);
  });

  it('lifts counts but leaves units to the resolver', () => {
    expect(liftQuantity('3 eggs')).toEqual({ quantity: 3, phrase: 'eggs' });
    expect(liftQuantity('couple of leeks')).toEqual({ quantity: 2, phrase: 'leeks' });
    expect(liftQuantity('400g pasta')).toEqual({ quantity: 1, phrase: '400g pasta' });
    expect(liftQuantity('garlic')).toEqual({ quantity: 1, phrase: 'garlic' });
  });

  it('keeps an unknown phrase as heard, marked unknown', () => {
    expect(foldSpokenItems(['zzqx'], () => null)).toEqual([{ name: 'zzqx', quantity: 1, known: false }]);
  });
});

describe('combobox suggestions', () => {
  it('typo path: "corgette" offers "Did you mean courgette?"', () => {
    const result = fieldSuggestions('corgette', lexicon);
    expect(result.ingredients).toEqual([]);
    expect(result.correction?.name).toBe('Courgette');
  });

  it('a normal prefix gets autocomplete and no correction', () => {
    const result = fieldSuggestions('cour', lexicon);
    expect(result.ingredients.map((i) => i.name)).toContain('Courgette');
    expect(result.correction).toBeNull();
  });

  it('aliases resolve to the catalog name rather than a correction', () => {
    const result = fieldSuggestions('zucchini', lexicon);
    expect(result.ingredients.map((i) => i.name)).toContain('Courgette');
    expect(result.correction).toBeNull();
  });
});
