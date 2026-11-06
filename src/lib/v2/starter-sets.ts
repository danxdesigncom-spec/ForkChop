import type { Ingredient } from '@/lib/types';

export interface StarterSet {
  id: 'cupboard' | 'fridge';
  label: string;
  items: string[];
}

/** Everyday fridge items, kept only where the catalogue has them. */
const FRIDGE = ['Eggs', 'Milk', 'Butter', 'Cheddar', 'Onion', 'Garlic', 'Carrot', 'Lemon'];

/**
 * The two starter sets on the empty-kitchen screen. "Store-cupboard basics"
 * is the catalogue's staples, the same list as the /staples page, minus
 * water. "Fridge staples" is a short everyday list filtered to names the
 * catalogue knows, so a tap never adds something the matcher can't place.
 */
export function starterSets(ingredients: readonly Ingredient[]): StarterSet[] {
  const known = new Map(ingredients.map((i) => [i.name.toLowerCase(), i.name]));
  const cupboard = ingredients
    .filter((i) => i.isStaple && i.id !== 'water')
    .map((i) => i.name)
    .sort((a, b) => a.localeCompare(b));
  const fridge = FRIDGE.flatMap((name) => {
    const hit = known.get(name.toLowerCase());
    return hit ? [hit] : [];
  });
  return [
    { id: 'cupboard', label: 'Store-cupboard basics', items: cupboard },
    { id: 'fridge', label: 'Fridge staples', items: fridge },
  ].filter((set): set is StarterSet => set.items.length > 0);
}
