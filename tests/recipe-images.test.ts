import { describe, expect, it } from 'vitest';
import { cardImageUrl, THEMEALDB_THUMB_SUFFIX } from '@/lib/recipes/images';
import { compareMinutes, formatAmount } from '@/lib/format';

describe('cardImageUrl', () => {
  it('asks TheMealDB for its thumbnail rendition', () => {
    expect(cardImageUrl('https://www.themealdb.com/images/media/meals/abc123.jpg')).toBe(
      `https://www.themealdb.com/images/media/meals/abc123.jpg${THEMEALDB_THUMB_SUFFIX}`,
    );
  });

  it('leaves every other URL alone, including ones already sized', () => {
    expect(cardImageUrl('https://img.spoonacular.com/recipes/1-312x231.jpg')).toBe('https://img.spoonacular.com/recipes/1-312x231.jpg');
    expect(cardImageUrl('https://www.themealdb.com/images/media/meals/abc.jpg/small')).toBe(
      'https://www.themealdb.com/images/media/meals/abc.jpg/small',
    );
    expect(cardImageUrl(null)).toBeNull();
  });
});

describe('compareMinutes', () => {
  it('sorts known times ascending and unknown ones last', () => {
    expect([null, 30, 10, null, 20].sort(compareMinutes)).toEqual([10, 20, 30, null, null]);
  });
});

describe('formatAmount', () => {
  it("prefers the source's own wording when there is one", () => {
    expect(formatAmount({ quantity: 1.5, unit: 'cup', note: null, display: '1 ½ cups' })).toBe('1 ½ cups');
  });

  it('formats seed ingredients exactly as before', () => {
    expect(formatAmount({ quantity: 200, unit: 'g', note: 'spaghetti' })).toBe('200 g, spaghetti');
    expect(formatAmount({ quantity: null, unit: null, note: 'to taste' })).toBe('to taste');
  });
});
