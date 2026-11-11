'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Recipe } from '@/lib/types';
import {
  getServerSnapshot,
  getSnapshot,
  setPantryItems,
  setSavedRecipes,
  subscribe,
  updatePantryState,
} from '@/lib/pantry-store';
import { addSavedRecipe, mergeLocalIntoAccount, removeSavedRecipe } from '@/lib/saved-recipes';
import {
  addPantryItem,
  clearPantry,
  mergeLocalPantry,
  removePantryItem,
  type PantrySource,
} from '@/lib/pantry-sync';

/**
 * The shopper's kitchen: pantry, allergens, dislikes, avoid-spicy and the
 * saved list, persisted locally (src/lib/pantry-store.ts) and written through
 * to the account when signed in. Shared by v1 PantryApp and v2 PantryAppV2.
 */
export function usePantry(userEmail: string | null) {
  // Persisted across reloads; see src/lib/pantry-store.ts.
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  /**
   * Local write first so the chip appears instantly, then a write-through to
   * the account when signed in. A failed sync surfaces a notice rather than
   * reverting — the item is still valid on this device.
   */
  const addToPantry = useCallback(
    (value: string, source: PantrySource = 'typed', barcode?: string) => {
      const alreadyThere = getSnapshot().pantry.some(
        (item) => item.toLowerCase() === value.toLowerCase(),
      );

      updatePantryState((current) =>
        alreadyThere ? current : { ...current, pantry: [...current.pantry, value] },
      );

      if (alreadyThere || !userEmail) return;

      void (async () => {
        const result = await addPantryItem(value, source, barcode);
        if (result.error) setSyncNotice(result.error);
        else setPantryItems(result.pantry);
      })();
    },
    [userEmail],
  );

  const removeFromPantry = useCallback(
    (value: string) => {
      updatePantryState((current) => ({
        ...current,
        pantry: current.pantry.filter((item) => item !== value),
      }));

      if (!userEmail) return;

      void (async () => {
        const result = await removePantryItem(value);
        if (result.error) setSyncNotice(result.error);
      })();
    },
    [userEmail],
  );

  const clearWholePantry = useCallback(() => {
    updatePantryState((current) => ({ ...current, pantry: [] }));
    if (!userEmail) return;
    void (async () => {
      const result = await clearPantry();
      if (result.error) setSyncNotice(result.error);
    })();
  }, [userEmail]);

  /**
   * Replace the pantry with `next` in one go (v2B Undo). Local first, then the
   * difference is written through to the account item by item, using the same
   * add/remove calls as everything else.
   */
  const restorePantry = useCallback(
    (next: string[]) => {
      const before = getSnapshot().pantry;
      updatePantryState((current) => ({ ...current, pantry: next }));
      if (!userEmail) return;

      const had = new Set(before.map((i) => i.toLowerCase()));
      const has = new Set(next.map((i) => i.toLowerCase()));
      const added = next.filter((i) => !had.has(i.toLowerCase()));
      const removed = before.filter((i) => !has.has(i.toLowerCase()));

      void (async () => {
        for (const item of removed) {
          const result = await removePantryItem(item);
          if (result.error) setSyncNotice(result.error);
        }
        for (const item of added) {
          const result = await addPantryItem(item, 'typed');
          if (result.error) setSyncNotice(result.error);
        }
      })();
    },
    [userEmail],
  );

  const toggleAllergen = useCallback((id: string) => {
    updatePantryState((current) => ({
      ...current,
      allergens: current.allergens.includes(id)
        ? current.allergens.filter((a) => a !== id)
        : [...current.allergens, id],
    }));
  }, []);

  const addDislike = useCallback((id: string) => {
    updatePantryState((current) =>
      current.dislikes.includes(id)
        ? current
        : { ...current, dislikes: [...current.dislikes, id] },
    );
  }, []);

  const removeDislike = useCallback((id: string) => {
    updatePantryState((current) => ({
      ...current,
      dislikes: current.dislikes.filter((d) => d !== id),
    }));
  }, []);

  /**
   * Optimistic locally, then written through to the account when signed in.
   *
   * The local write happens first either way so the heart responds instantly;
   * a failed sync surfaces a notice rather than silently reverting, since the
   * save is still valid on this device.
   */
  const toggleSaved = useCallback(
    (slug: string, recipe?: Recipe) => {
      const wasSaved = getSnapshot().saved.includes(slug);

      updatePantryState((current) => ({
        ...current,
        saved: wasSaved
          ? current.saved.filter((s) => s !== slug)
          : [...current.saved, slug],
      }));

      if (!userEmail) return;

      void (async () => {
        const result = wasSaved ? await removeSavedRecipe(slug) : await addSavedRecipe(slug, recipe);
        if (result.error) {
          setSyncNotice(result.error);
          return;
        }
        // Adds return the canonical list; deletes do not, to save a round-trip.
        if (result.slugs.length > 0) setSavedRecipes(result.slugs);
      })();
    },
    [userEmail],
  );

  const savedSet = useMemo(() => new Set(state.saved), [state.saved]);

  /**
   * On sign-in, fold this browser's saves into the account and adopt the
   * account's list. Runs once per signed-in session, not on every render.
   *
   * Reads the saved list via getSnapshot() rather than closing over `saved`, so
   * this effect does not re-run — and every recipe card does not re-render —
   * each time a heart is toggled.
   */
  const mergedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!userEmail || mergedForRef.current === userEmail) return;
    mergedForRef.current = userEmail;

    void (async () => {
      const [recipes, pantry] = await Promise.all([
        mergeLocalIntoAccount(getSnapshot().saved),
        mergeLocalPantry(getSnapshot().pantry),
      ]);

      if (recipes.error) setSyncNotice(recipes.error);
      setSavedRecipes(recipes.slugs);

      if (pantry.error) setSyncNotice(pantry.error);
      else setPantryItems(pantry.pantry);
    })();
  }, [userEmail]);

  return {
    ...state,
    savedSet,
    syncNotice,
    setSyncNotice,
    addToPantry,
    removeFromPantry,
    clearWholePantry,
    restorePantry,
    toggleAllergen,
    addDislike,
    removeDislike,
    toggleSaved,
  };
}
