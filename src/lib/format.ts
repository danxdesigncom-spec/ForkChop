import type { RecipeIngredient } from './types';

const CURRENCY_LOCALE: Record<string, string> = { GBP: 'en-GB', USD: 'en-US', EUR: 'de-DE' };

export function formatMoney(cents: number, currency = 'GBP'): string {
  return new Intl.NumberFormat(CURRENCY_LOCALE[currency] ?? 'en-GB', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

/** "400 g chopped tomatoes", falling back gracefully when there is no amount. */
export function formatAmount(ingredient: Pick<RecipeIngredient, 'quantity' | 'unit' | 'note'>): string {
  const parts: string[] = [];
  if (ingredient.quantity != null) {
    parts.push(Number.isInteger(ingredient.quantity) ? String(ingredient.quantity) : String(ingredient.quantity));
  }
  if (ingredient.unit) parts.push(ingredient.unit);
  const amount = parts.join(' ');
  if (amount && ingredient.note) return `${amount}, ${ingredient.note}`;
  return amount || ingredient.note || '';
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
