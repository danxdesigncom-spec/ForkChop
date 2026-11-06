import Image from 'next/image';
import { Cake, Coffee, CookingPot, Salad, Sandwich, UtensilsCrossed } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Recipe } from '@/lib/types';
import { ChefPig } from './ChefPig';
import { cn } from './cn';

/** One icon per meal type, for recipes without a photo (README open decision 1). */
const ICON_PROPS = { size: 40, strokeWidth: 1.5, className: 'text-muted' } as const;
const MEAL_ICON: Record<string, ReactNode> = {
  breakfast: <Coffee {...ICON_PROPS} />,
  brunch: <Coffee {...ICON_PROPS} />,
  lunch: <Sandwich {...ICON_PROPS} />,
  dinner: <CookingPot {...ICON_PROPS} />,
  snack: <UtensilsCrossed {...ICON_PROPS} />,
  dessert: <Cake {...ICON_PROPS} />,
  side: <Salad {...ICON_PROPS} />,
};

/** Token-backed tints, cycled by slug so a recipe keeps its colour. */
const TINTS = ['bg-saffron-soft', 'bg-brand-soft', 'bg-blush', 'bg-raised'];

function tintFor(slug: string): string {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

interface Props {
  recipe: Pick<Recipe, 'slug' | 'title' | 'imageUrl' | 'mealTypes'>;
  className?: string;
  /** Rendered `sizes` for next/image. */
  sizes: string;
}

/**
 * The photo area of a recipe card. A real photo when the source has one;
 * otherwise a tinted panel with a meal icon, or a small chef when there's
 * no meal type. Always decorative: the title sits right next to it.
 */
export function RecipeVisual({ recipe, className, sizes }: Props) {
  if (recipe.imageUrl) {
    return (
      <div className={cn('relative overflow-hidden bg-raised', className)}>
        <Image src={recipe.imageUrl} alt="" fill sizes={sizes} className="object-cover" />
      </div>
    );
  }
  const icon = recipe.mealTypes.map((m) => MEAL_ICON[m]).find(Boolean);
  return (
    <div className={cn('relative flex items-center justify-center', tintFor(recipe.slug), className)} aria-hidden="true">
      {icon ?? <ChefPig size={48} variant="solid" />}
    </div>
  );
}
