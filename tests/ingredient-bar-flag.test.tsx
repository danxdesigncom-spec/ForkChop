import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PantryAppV2 } from '@/components/v2/PantryAppV2';
import { getFlags, type FeatureFlags } from '@/lib/flags';

/**
 * docs/redesign/07-ingredient-bar-b.md §9: with `ingredientBarB` off, the
 * existing v2 bar renders; with it on, the version B field does. Rendered on
 * the server (no DOM needed), the same way the first paint is.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

function renderHome(flags: Partial<FeatureFlags>) {
  return renderToStaticMarkup(
    <PantryAppV2
      allTags={[]}
      ingredients={[]}
      facets={{ diets: [], regions: [], mealTypes: [] }}
      providers={[]}
      userEmail={null}
      authConfigured={false}
      authSetupHint=""
      flags={{ ...getFlags(), redesign: true, ...flags }}
    />,
  );
}

describe('ingredientBarB flag', () => {
  it('off: the existing v2 field renders, unchanged', () => {
    const html = renderHome({ ingredientBarB: false });
    expect(html).toContain('placeholder="What&#x27;s in your kitchen?"');
    // Speak is client-only (feature-detected after hydration), so only Scan is in the first paint.
    expect(html).toContain('aria-label="Scan a barcode"');
    expect(html).not.toContain('role="combobox"');
  });

  it('on: the version B combobox field renders instead', () => {
    const html = renderHome({ ingredientBarB: true });
    expect(html).toContain('role="combobox"');
    expect(html).toContain('placeholder="Add an ingredient, e.g. garlic"');
    expect(html).toContain('aria-label="Scan a barcode"');
    expect(html).not.toContain('placeholder="What&#x27;s in your kitchen?"');
  });
});
