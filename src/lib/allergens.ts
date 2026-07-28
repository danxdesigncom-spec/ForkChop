/**
 * The allergens users can filter on.
 *
 * Scope note: these cover the common declarable allergens that actually appear
 * in this recipe corpus. They are derived from the ingredient list only — this
 * is a convenience filter, not a substitute for reading a product label, and
 * the UI says so.
 */
export const ALLERGENS = [
  { id: 'peanut', label: 'Peanuts', emoji: '🥜' },
  { id: 'tree-nut', label: 'Tree nuts', emoji: '🌰' },
  { id: 'dairy', label: 'Dairy', emoji: '🥛' },
  { id: 'egg', label: 'Egg', emoji: '🥚' },
  { id: 'gluten', label: 'Gluten', emoji: '🌾' },
  { id: 'soy', label: 'Soy', emoji: '🌱' },
  { id: 'fish', label: 'Fish', emoji: '🐟' },
  { id: 'shellfish', label: 'Shellfish', emoji: '🦐' },
  { id: 'sesame', label: 'Sesame', emoji: '🫓' },
  { id: 'mustard', label: 'Mustard', emoji: '🌭' },
  { id: 'celery', label: 'Celery', emoji: '🥬' },
] as const;

export type AllergenId = (typeof ALLERGENS)[number]['id'];

export const ALLERGEN_IDS = ALLERGENS.map((a) => a.id) as readonly string[];

export function allergenLabel(id: string): string {
  return ALLERGENS.find((a) => a.id === id)?.label ?? id;
}
