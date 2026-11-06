'use client';

import { useCallback, useMemo, useState } from 'react';
import type { RecipeIngredient, RecipeMatch } from '@/lib/types';
import type { BasketItem } from '@/components/BasketPanel';

/** Missing ingredients the shopper has chosen to buy, keyed by ingredient id. */
export function useBasket() {
  const [basket, setBasket] = useState<Map<string, BasketItem>>(new Map());

  const toggleBasket = useCallback((ingredient: RecipeIngredient, recipeTitle: string) => {
    setBasket((current) => {
      const next = new Map(current);
      const existing = next.get(ingredient.id);

      if (existing) {
        // Second click on the same chip removes it; clicking it from a
        // different recipe just records the extra reason it is needed.
        if (existing.neededFor.includes(recipeTitle)) {
          next.delete(ingredient.id);
          return next;
        }
        next.set(ingredient.id, { ...existing, neededFor: [...existing.neededFor, recipeTitle] });
        return next;
      }

      next.set(ingredient.id, {
        ingredientId: ingredient.id,
        name: ingredient.name,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        category: ingredient.category,
        neededFor: [recipeTitle],
      });
      return next;
    });
  }, []);

  const addAllMissing = useCallback((match: RecipeMatch) => {
    setBasket((current) => {
      const next = new Map(current);
      for (const ingredient of match.missing) {
        const existing = next.get(ingredient.id);
        const neededFor = existing
          ? [...new Set([...existing.neededFor, match.recipe.title])]
          : [match.recipe.title];
        next.set(ingredient.id, {
          ingredientId: ingredient.id,
          name: ingredient.name,
          quantity: ingredient.quantity,
          unit: ingredient.unit,
          category: ingredient.category,
          neededFor,
        });
      }
      return next;
    });
  }, []);

  /** Adds one ingredient if it isn't there yet (v2 chips add, they don't toggle). */
  const addToBasket = useCallback((ingredient: RecipeIngredient, recipeTitle?: string) => {
    setBasket((current) => {
      if (current.has(ingredient.id)) return current;
      const next = new Map(current);
      next.set(ingredient.id, {
        ingredientId: ingredient.id,
        name: ingredient.name,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        category: ingredient.category,
        neededFor: recipeTitle ? [recipeTitle] : [],
      });
      return next;
    });
  }, []);

  const removeFromBasket = useCallback((id: string) => {
    setBasket((current) => {
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  }, []);

  const clearBasket = useCallback(() => setBasket(new Map()), []);

  const basketIds = useMemo(() => new Set(basket.keys()), [basket]);
  const basketItems = useMemo(() => [...basket.values()], [basket]);

  return {
    basket,
    basketIds,
    basketItems,
    toggleBasket,
    addAllMissing,
    addToBasket,
    removeFromBasket,
    clearBasket,
  };
}
