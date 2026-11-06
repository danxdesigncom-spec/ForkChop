import { describe, expect, it } from 'vitest';
import { INGREDIENTS } from '@/lib/db/data/ingredients';
import { starterSets } from '@/lib/v2/starter-sets';
import type { Ingredient } from '@/lib/types';

const ingredients: Ingredient[] = INGREDIENTS.map((i) => ({
  id: i.id,
  name: i.name,
  category: i.category,
  isStaple: i.staple ?? false,
  allergens: i.allergens ?? [],
  isSpicy: i.spicy ?? false,
}));

describe('starterSets', () => {
  it('builds the cupboard set from the catalogue staples, without water', () => {
    const [cupboard] = starterSets(ingredients);
    expect(cupboard.label).toBe('Store-cupboard basics');
    expect(cupboard.items).toContain('Olive oil');
    expect(cupboard.items).not.toContain('Water');
    const staples = ingredients.filter((i) => i.isStaple && i.id !== 'water').map((i) => i.name);
    expect([...cupboard.items].sort()).toEqual([...staples].sort());
  });

  it('only offers fridge items the catalogue knows', () => {
    const fridge = starterSets(ingredients).find((s) => s.id === 'fridge');
    const names = new Set(ingredients.map((i) => i.name));
    expect(fridge?.items.length).toBeGreaterThan(0);
    for (const name of fridge!.items) expect(names.has(name)).toBe(true);
  });

  it('drops a set with nothing in it', () => {
    expect(starterSets([])).toEqual([]);
  });
});
