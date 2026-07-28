import { describe, expect, it } from 'vitest';
import {
  formatShoppingListText,
  groupShoppingList,
  shoppingListFilename,
  type ShoppingListItem,
} from '@/lib/shopping-list';

const item = (
  name: string,
  category: string,
  extra: Partial<ShoppingListItem> = {},
): ShoppingListItem => ({
  ingredientId: name.toLowerCase().replace(/\s+/g, '-'),
  name,
  quantity: null,
  unit: null,
  neededFor: [],
  category,
  ...extra,
});

describe('groupShoppingList', () => {
  it('groups items into store departments in aisle order', () => {
    const groups = groupShoppingList([
      item('Cumin', 'spice'),
      item('Chicken breast', 'protein'),
      item('Basil', 'produce'),
    ]);

    expect(groups.map((g) => g.department)).toEqual([
      'Produce',
      'Meat & Seafood',
      'Herbs & Spices',
    ]);
  });

  it('sorts items alphabetically inside a department', () => {
    const groups = groupShoppingList([
      item('Onion', 'produce'),
      item('Basil', 'produce'),
      item('Carrot', 'produce'),
    ]);

    expect(groups[0].items.map((i) => i.name)).toEqual(['Basil', 'Carrot', 'Onion']);
  });

  it('files unknown categories under Other', () => {
    const groups = groupShoppingList([item('Mystery', 'not-a-real-category')]);
    expect(groups[0].department).toBe('Other');
  });

  it('handles an empty list', () => {
    expect(groupShoppingList([])).toEqual([]);
  });
});

describe('formatShoppingListText', () => {
  const items = [
    item('Basil', 'produce', { quantity: 1, unit: 'bunch', neededFor: ['Tomato & Basil Pasta'] }),
    item('Chicken breast', 'protein', { quantity: 400, unit: 'g' }),
  ];

  const text = formatShoppingListText(items, { date: new Date('2026-07-28T12:00:00Z') });

  it('lists every item as a checkbox line', () => {
    expect(text).toContain('[ ] Basil — 1 bunch');
    expect(text).toContain('[ ] Chicken breast — 400 g');
  });

  it('includes department headings', () => {
    expect(text).toContain('PRODUCE');
    expect(text).toContain('MEAT & SEAFOOD');
  });

  it('notes which recipe an item is for', () => {
    expect(text).toContain('for: Tomato & Basil Pasta');
  });

  it('reports the item count', () => {
    expect(text.trimEnd().endsWith('2 items')).toBe(true);
  });

  it('omits the dash when there is no amount', () => {
    const plain = formatShoppingListText([item('Salt', 'spice')]);
    expect(plain).toContain('[ ] Salt');
    expect(plain).not.toContain('Salt —');
  });
});

describe('shoppingListFilename', () => {
  it('stamps the date', () => {
    expect(shoppingListFilename(new Date('2026-07-28T12:00:00Z'))).toBe(
      'forkchop-shopping-list-2026-07-28.txt',
    );
  });
});
