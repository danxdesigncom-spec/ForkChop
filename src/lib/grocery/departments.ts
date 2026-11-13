/**
 * Store department names, shared between the providers and the basket UI.
 *
 * A real provider supplies its own aisle names on each offer plus a
 * `departmentOrder` on the cart, so the UI never has to hardcode a taxonomy —
 * it only falls back to these when a department is unrecognised.
 */

/** Departments in the order a shopper would walk them. */
export const DEPARTMENT_ORDER = [
  'Produce',
  'Meat & Seafood',
  'Dairy & Eggs',
  'Bakery',
  'Grains & Pasta',
  'Pantry',
  'Sauces & Condiments',
  'Herbs & Spices',
  'Other',
];

/** ForkChop ingredient category -> the aisle a typical store shelves it in. */
export const DEPARTMENT_BY_CATEGORY: Record<string, string> = {
  produce: 'Produce',
  protein: 'Meat & Seafood',
  dairy: 'Dairy & Eggs',
  bakery: 'Bakery',
  grain: 'Grains & Pasta',
  pantry: 'Pantry',
  condiment: 'Sauces & Condiments',
  spice: 'Herbs & Spices',
  other: 'Other',
};

const DEPARTMENT_ICONS: Record<string, string> = {
  Produce: '🥬',
  'Meat & Seafood': '🥩',
  'Dairy & Eggs': '🥛',
  Bakery: '🍞',
  'Grains & Pasta': '🌾',
  Pantry: '🥫',
  'Sauces & Condiments': '🧂',
  'Herbs & Spices': '🌿',
  Other: '🛒',
};

export function departmentIcon(department: string): string {
  return DEPARTMENT_ICONS[department] ?? '🛒';
}
