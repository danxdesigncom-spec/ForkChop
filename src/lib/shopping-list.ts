import { DEPARTMENT_BY_CATEGORY, DEPARTMENT_ORDER } from './grocery/departments';

export interface ShoppingListItem {
  ingredientId: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  neededFor: string[];
  /** Ingredient category, used to place the item in a store department. */
  category?: string;
}

export interface ShoppingListGroup {
  department: string;
  items: ShoppingListItem[];
}

/**
 * Group a shopping list into store departments, in aisle order.
 *
 * Works without a grocery provider, which is the point: the export option has
 * to function whether or not any storefront is connected.
 */
export function groupShoppingList(items: ShoppingListItem[]): ShoppingListGroup[] {
  const rank = new Map(DEPARTMENT_ORDER.map((name, index) => [name, index]));
  const byDepartment = new Map<string, ShoppingListItem[]>();

  for (const item of items) {
    const department = DEPARTMENT_BY_CATEGORY[item.category ?? 'other'] ?? 'Other';
    const list = byDepartment.get(department) ?? [];
    list.push(item);
    byDepartment.set(department, list);
  }

  return [...byDepartment.entries()]
    .map(([department, groupItems]) => ({
      department,
      items: [...groupItems].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort(
      (a, b) =>
        (rank.get(a.department) ?? DEPARTMENT_ORDER.length) -
          (rank.get(b.department) ?? DEPARTMENT_ORDER.length) ||
        a.department.localeCompare(b.department),
    );
}

export function formatAmountLabel(item: ShoppingListItem): string {
  if (item.quantity == null && !item.unit) return '';
  return [item.quantity, item.unit].filter(Boolean).join(' ');
}

/**
 * Plain-text shopping list, for the clipboard or a .txt download.
 *
 * Deliberately checkbox-styled ASCII rather than anything clever — it has to
 * survive being pasted into Notes, a text message, or printed on paper.
 */
export function formatShoppingListText(
  items: ShoppingListItem[],
  options: { title?: string; date?: Date } = {},
): string {
  const { title = 'ForkChop shopping list', date = new Date() } = options;
  const groups = groupShoppingList(items);

  const lines: string[] = [
    title,
    date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
    '='.repeat(Math.max(title.length, 28)),
    '',
  ];

  for (const group of groups) {
    lines.push(`${group.department.toUpperCase()}`);
    lines.push('-'.repeat(group.department.length));
    for (const item of group.items) {
      const amount = formatAmountLabel(item);
      lines.push(`  [ ] ${item.name}${amount ? ` — ${amount}` : ''}`);
      if (item.neededFor.length > 0) {
        lines.push(`        for: ${item.neededFor.join(', ')}`);
      }
    }
    lines.push('');
  }

  lines.push(`${items.length} item${items.length === 1 ? '' : 's'}`);
  return lines.join('\n');
}

/** Filename-safe stamp, e.g. forkchop-shopping-list-2026-07-28.txt */
export function shoppingListFilename(date = new Date()): string {
  return `forkchop-shopping-list-${date.toISOString().slice(0, 10)}.txt`;
}
