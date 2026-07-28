import { describe, expect, it } from 'vitest';
import { INGREDIENTS } from '@/lib/db/data/ingredients';
import { buildLexicon, resolveIngredient, singularizeWord, suggestIngredients } from '@/lib/matching/normalize';
import type { Ingredient } from '@/lib/types';

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
const resolve = (input: string) => resolveIngredient(input, lexicon).ingredientId;

describe('singularizeWord', () => {
  it('handles regular and irregular plurals', () => {
    expect(singularizeWord('tomatoes')).toBe('tomato');
    expect(singularizeWord('berries')).toBe('berry');
    expect(singularizeWord('leaves')).toBe('leaf');
    expect(singularizeWord('carrots')).toBe('carrot');
  });

  it('leaves non-plural words ending in s alone', () => {
    expect(singularizeWord('couscous')).toBe('couscous');
    expect(singularizeWord('peas')).toBe('peas');
    expect(singularizeWord('hummus')).toBe('hummus');
  });
});

describe('resolveIngredient', () => {
  it('matches canonical names', () => {
    expect(resolve('onion')).toBe('onion');
    expect(resolve('Chicken breast')).toBe('chicken-breast');
  });

  it('matches aliases across dialects', () => {
    expect(resolve('cilantro')).toBe('coriander');
    expect(resolve('zucchini')).toBe('courgette');
    expect(resolve('eggplant')).toBe('aubergine');
    expect(resolve('scallions')).toBe('spring-onion');
    expect(resolve('garbanzo beans')).toBe('chickpeas');
  });

  it('strips quantities and units', () => {
    expect(resolve('2 tbsp olive oil')).toBe('olive-oil');
    expect(resolve('400g tin of chopped tomatoes')).toBe('chopped-tomatoes');
    expect(resolve('3 cloves of garlic')).toBe('garlic');
    expect(resolve('1/2 cup rice')).toBe('rice');
  });

  it('strips preparation words', () => {
    expect(resolve('finely diced red onion')).toBe('red-onion');
    expect(resolve('2 boneless skinless chicken breasts')).toBe('chicken-breast');
    expect(resolve('freshly grated parmesan cheese')).toBe('parmesan');
  });

  it('does not let prep-word stripping override a more specific match', () => {
    // The regression this staging exists for: strip "ground" too early and
    // these collapse onto the fresh herb / plain beef.
    expect(resolve('ground coriander')).toBe('coriander-seed');
    expect(resolve('coriander')).toBe('coriander');
    expect(resolve('ground beef')).toBe('beef-mince');
    expect(resolve('fresh ginger')).toBe('ginger');
  });

  it('prefers the most specific phrase when several could match', () => {
    expect(resolve('chicken stock')).toBe('stock');
    expect(resolve('chicken')).toBe('chicken-breast');
    expect(resolve('extra virgin olive oil')).toBe('olive-oil');
  });

  it('tolerates typos in longer words', () => {
    expect(resolve('tomatos')).toBe('tomato');
    expect(resolve('brocoli')).toBe('broccoli');
    expect(resolve('chiken breast')).toBe('chicken-breast');
  });

  it('returns null rather than guessing at unknown input', () => {
    expect(resolve('dragonfruit')).toBeNull();
    expect(resolve('')).toBeNull();
    expect(resolve('   ')).toBeNull();
  });

  it('reports how confident the match was', () => {
    expect(resolveIngredient('onion', lexicon).confidence).toBe(1);
    expect(resolveIngredient('tomatos', lexicon).confidence).toBeLessThan(1);
    expect(resolveIngredient('dragonfruit', lexicon).confidence).toBe(0);
  });
});

describe('suggestIngredients', () => {
  it('ranks prefix matches above substring matches', () => {
    const results = suggestIngredients('chick', lexicon).map((i) => i.id);
    expect(results).toContain('chicken-breast');
    expect(results).toContain('chickpeas');
  });

  it('finds ingredients via their aliases', () => {
    expect(suggestIngredients('zucc', lexicon).map((i) => i.id)).toContain('courgette');
  });

  it('returns nothing for empty input', () => {
    expect(suggestIngredients('', lexicon)).toEqual([]);
  });
});
