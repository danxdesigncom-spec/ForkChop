/**
 * ForkChop v2 — automated accessibility gate.
 *
 * Mirrors "Accessibility audit v2" on the design canvas: axe (WCAG 2.0/2.1/2.2 A+AA),
 * visible focus on every tab stop, 24px minimum targets, and dialog Esc/focus return.
 * Runs in 4 Playwright projects (desktop/mobile × light/dark); see playwright.config.ts.
 *
 * Selectors use roles and accessible names from 03-components.md / 04-screens.md, so a failing
 * locator here usually means an accessible name drifted, which is itself a regression.
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const FIELD = /add an ingredient|what's in your kitchen|add more|add another/i;

async function expectNoAxeViolations(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = violations.map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.help}`);
  expect(summary, `axe violations on ${label}`).toEqual([]);
}

async function addIngredients(page: Page, names: string[]) {
  const field = page.getByRole('textbox', { name: FIELD }).first();
  for (const name of names) {
    await field.fill(name);
    await field.press('Enter');
  }
}

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;

test.describe('v2 accessibility', () => {
  test('home, empty', async ({ page }) => {
    await page.goto('/');
    await expectNoAxeViolations(page, 'home (empty)');
  });

  test('results with ingredients, page 1 and 2', async ({ page }) => {
    await page.goto('/');
    await addIngredients(page, ['eggs', 'onion', 'garlic', 'chopped tomatoes', 'pasta', 'cheddar']);
    if (isMobile(page)) await page.getByRole('link', { name: /show .*recipes/i }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoAxeViolations(page, 'results p1');

    const pager = page.getByRole('navigation', { name: 'Recipe pages' });
    await pager.getByRole('link', { name: /next/i }).click();
    await expect(page).toHaveURL(/page=2/);
    // Focus moves to the results heading after a page change (04-screens §2).
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await expectNoAxeViolations(page, 'results p2');
  });

  test('24 ingredients: "Your kitchen" popover', async ({ page }) => {
    test.skip(isMobile(page), 'desktop header pattern; mobile uses "Show all"');
    await page.goto('/');
    await addIngredients(page, [
      'eggs', 'onion', 'garlic', 'chopped tomatoes', 'pasta', 'cheddar', 'rice', 'chicken breast',
      'chickpeas', 'spinach', 'potatoes', 'butter', 'milk', 'lemon', 'chilli', 'soy sauce',
      'frozen peas', 'carrots', 'plain flour', 'olive oil', 'cumin', 'paprika', 'thyme', 'coconut milk',
    ]);
    const more = page.getByRole('button', { name: /\+\d+ more/i });
    await more.click();
    await expect(page.getByRole('dialog', { name: /your kitchen/i })).toBeVisible();
    await expectNoAxeViolations(page, 'your-kitchen popover');
    await page.keyboard.press('Escape');
    await expect(more).toBeFocused();
  });

  test('basket: empty and filled; send disabled with a reason', async ({ page }) => {
    await page.goto('/');
    await addIngredients(page, ['eggs', 'onion', 'garlic', 'pasta']);
    if (isMobile(page)) await page.getByRole('link', { name: /show .*recipes/i }).click();

    const send = page.getByRole('button', { name: /send to kroger/i });
    if (isMobile(page)) {
      // Empty basket: no floating bar yet, so check the sheet after adding an item.
    } else {
      await expect(send).toBeDisabled();
      await expect(send).toHaveAttribute('aria-describedby', /.+/);
      await expectNoAxeViolations(page, 'basket (empty)');
    }

    await page.getByRole('button', { name: /^add .+ to basket$/i }).first().click();
    if (isMobile(page)) {
      const review = page.getByRole('link', { name: /items? in basket/i });
      await review.click();
      const sheet = page.getByRole('dialog', { name: /your basket/i });
      await expect(sheet).toBeVisible();
      await expectNoAxeViolations(page, 'basket sheet');
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
    } else {
      await expect(send).toBeEnabled();
      await expect(page.getByRole('button', { name: 'Pickup' })).toHaveAttribute('aria-pressed', 'true');
      await expectNoAxeViolations(page, 'basket (filled)');
    }
  });

  test('every tab stop shows a visible focus indicator', async ({ page }) => {
    await page.goto('/');
    await addIngredients(page, ['eggs', 'onion', 'garlic']);
    const misses: string[] = [];
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press('Tab');
      const r = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const has = (e: Element) => {
          const cs = getComputedStyle(e);
          return (cs.boxShadow && cs.boxShadow !== 'none') || (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0);
        };
        const field = el.closest('.field');
        return { name: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40), ok: has(el) || (!!field && has(field)) };
      });
      if (!r) break;
      if (!r.ok) misses.push(r.name);
    }
    expect(misses, 'tab stops without a visible focus indicator').toEqual([]);
  });

  test('targets are at least 24×24 (WCAG 2.5.8)', async ({ page }) => {
    await page.goto('/');
    await addIngredients(page, ['eggs', 'onion', 'garlic']);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('button, a[href], input, select, [role="tab"]')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          if (!r.width || r.height <= 1) return false; // hidden / sr-only
          const inlineText = el.tagName === 'A' && getComputedStyle(el).display === 'inline';
          return !inlineText && (r.width < 24 || r.height < 24);
        })
        .map((el) => (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40)),
    );
    expect(small, 'targets under 24px').toEqual([]);
  });
});
