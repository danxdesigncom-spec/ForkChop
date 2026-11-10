/**
 * ForkChop v2 — automated accessibility gate.
 *
 * Mirrors "Accessibility audit v2" on the design canvas: axe (WCAG 2.0/2.1/2.2 A+AA),
 * visible focus on every tab stop, 24px minimum targets, and dialog Esc/focus return.
 * Runs in 4 Playwright projects (desktop/mobile × light/dark); see playwright.config.ts.
 *
 * Runs with the v2B ingredient bar on (docs/redesign/07-ingredient-bar-b.md), which is
 * the experience being rolled out. The bottom block is the Phase 7 regression suite.
 *
 * Selectors use roles and accessible names from 03-components.md / 04-screens.md, so a failing
 * locator here usually means an accessible name drifted, which is itself a regression.
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const FIELD = /add an ingredient|what's in your kitchen|add more|add another/i;
const PANTRY_KEY = 'forkchop.pantry.v1';

const TWENTY_FOUR = [
  'Egg', 'Onion', 'Garlic', 'Chopped tomatoes', 'Pasta', 'Cheddar', 'Rice', 'Chicken breast',
  'Chickpeas', 'Spinach', 'Potato', 'Butter', 'Milk', 'Lemon', 'Chilli', 'Soy sauce',
  'Peas', 'Carrot', 'Plain flour', 'Olive oil', 'Cumin', 'Paprika', 'Thyme', 'Coconut milk',
];

/**
 * A stand-in for the browser's speech recogniser, so Speak always renders and the
 * listening state can be driven: one interim result, then one final.
 */
const FAKE_SPEECH = `
  window.SpeechRecognition = class {
    start() {
      setTimeout(() => this.onresult?.({ resultIndex: 0, results: { length: 1, 0: { 0: { transcript: 'two onions some garlic' }, isFinal: false, length: 1 } } }), 100);
      setTimeout(() => this.onresult?.({ resultIndex: 0, results: { length: 1, 0: { 0: { transcript: 'two onions, some garlic and a tin of chopped tomatoes' }, isFinal: true, length: 1 } } }), 300);
    }
    stop() { setTimeout(() => this.onend?.(), 10); }
    abort() { this.stop(); }
  };
`;

async function expectNoAxeViolations(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = violations.map(
    (v) => `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.help} [${v.nodes[0]?.target.join(' ')}]`,
  );
  expect(summary, `axe violations on ${label}`).toEqual([]);
}

/** The v2B field is a combobox; the original v2 field is a plain textbox. */
const fieldOf = (page: Page) =>
  page.getByRole('combobox', { name: FIELD }).or(page.getByRole('textbox', { name: FIELD })).first();

async function addIngredients(page: Page, names: string[]) {
  const field = fieldOf(page);
  for (const name of names) {
    await field.fill(name);
    await field.press('Enter');
  }
}

/** Home -> results: "Find recipes" on desktop, the sticky "Show N recipes" on mobile. */
async function showResults(page: Page) {
  await page
    .getByRole('button', { name: /^(find recipes|show \d+ recipes?)$/i })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(/page=1/);
}

/** Start with a kitchen already stocked, straight on the results view. */
async function openResultsWith(page: Page, pantry: string[]) {
  await page.addInitScript(
    ([key, items]) => localStorage.setItem(key as string, JSON.stringify({ pantry: items })),
    [PANTRY_KEY, pantry],
  );
  await page.goto(pantry.length > 0 ? '/?page=1' : '/');
  await expect(fieldOf(page)).toBeVisible();
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
    await showResults(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoAxeViolations(page, 'results p1');

    // "All" has enough recipes for a second page at both sizes.
    await page.getByRole('tab', { name: /^all/i }).click();
    const pager = page.getByRole('navigation', { name: 'Recipe pages' });
    await pager.getByRole('link', { name: 'Next page' }).click();
    await expect(page).toHaveURL(/page=2/);
    // Focus moves to the results heading after a page change (04-screens §2).
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    // Let the new page settle before auditing it.
    await expect(page.getByRole('tabpanel')).not.toHaveAttribute('aria-busy', 'true');
    await expectNoAxeViolations(page, 'results p2');
  });

  test('24 ingredients: "Your kitchen" tray', async ({ page }) => {
    await openResultsWith(page, TWENTY_FOUR);
    const tray = page.getByRole('region', { name: /your kitchen/i });
    await expect(tray).toBeVisible();
    if (isMobile(page)) {
      // Mobile: one scrolling row, and Edit opens the sheet for bulk removal.
      const edit = tray.getByRole('button', { name: 'Edit' });
      await edit.click();
      const sheet = page.getByRole('dialog', { name: /your kitchen/i });
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole('button', { name: /^remove /i })).toHaveCount(24);
      await expectNoAxeViolations(page, 'your-kitchen sheet');
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
      await expect(edit).toBeFocused();
    } else {
      // Desktop: capped at two rows, then "Show all 24" expands in place.
      const more = tray.getByRole('button', { name: 'Show all 24' });
      await expect(more).toHaveAttribute('aria-expanded', 'false');
      const shown = await tray.getByRole('button', { name: /^remove /i }).count();
      expect(shown).toBeLessThan(24);
      await more.click();
      await expect(tray.getByRole('button', { name: /^remove /i })).toHaveCount(24);
      await expect(tray.getByRole('button', { name: 'Show fewer' })).toHaveAttribute('aria-expanded', 'true');
      await expectNoAxeViolations(page, 'your-kitchen tray (expanded)');
    }
  });

  test('basket: empty and filled; send disabled with a reason', async ({ page }) => {
    await page.goto('/');
    await addIngredients(page, ['eggs', 'onion', 'garlic', 'pasta']);
    await showResults(page);
    await page.getByRole('tab', { name: /^almost/i }).click();

    const send = page.getByRole('button', { name: /^send to /i });
    if (!isMobile(page)) {
      await expect(send).toBeDisabled();
      await expect(send).toHaveAttribute('aria-describedby', /.+/);
      await expectNoAxeViolations(page, 'basket (empty)');
    }

    await page.getByRole('button', { name: /^add .+ to basket$/i }).first().click();
    if (isMobile(page)) {
      await page.getByRole('button', { name: /items? in basket/i }).click();
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
    await page.locator('body').click({ position: { x: 1, y: 1 } });
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
          if (!r.width || r.height <= 1) return false; // hidden
          // Visually hidden until focused (the skip link): clipped to nothing.
          const cs = getComputedStyle(el);
          if (cs.clip === 'rect(0px, 0px, 0px, 0px)' || cs.clipPath === 'inset(50%)') return false;
          const inlineText = el.tagName === 'A' && cs.display === 'inline';
          return !inlineText && (r.width < 24 || r.height < 24);
        })
        .map((el) => (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40)),
    );
    expect(small, 'targets under 24px').toEqual([]);
  });
});

/* ------------------------------------------------------------------------------------------ */
/* Phase 7: ingredient bar version B (docs/redesign/07-ingredient-bar-b.md §9)                  */
/* ------------------------------------------------------------------------------------------ */

test.describe('v2B ingredient bar', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(FAKE_SPEECH);
  });

  for (const count of [0, 5, 24]) {
    test(`wrap regression: fixed field height with ${count} ingredients`, async ({ page }) => {
      await openResultsWith(page, TWENTY_FOUR.slice(0, count));
      const field = page.locator('.field').filter({ has: page.getByRole('combobox', { name: FIELD }) });
      const box = await field.boundingBox();
      expect(box?.height).toBe(isMobile(page) ? 56 : 52);
      const speak = await page.getByRole('button', { name: 'Speak' }).boundingBox();
      const scan = await page.getByRole('button', { name: 'Scan a barcode' }).boundingBox();
      expect(speak, 'Speak is shown where speech recognition exists').not.toBeNull();
      expect(speak?.y).toBe(scan?.y);
      // The header never wraps and the page never scrolls sideways.
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(page.viewportSize()!.width);
    });
  }

  test('combobox works by keyboard alone', async ({ page }) => {
    await openResultsWith(page, ['Egg', 'Rice']);
    const field = page.getByRole('combobox', { name: 'Add an ingredient' });
    await field.fill('cour');
    const listbox = page.getByRole('listbox', { name: 'Suggestions' });
    await expect(listbox).toBeVisible();
    await expect(field).toHaveAttribute('aria-expanded', 'true');
    const first = await field.getAttribute('aria-activedescendant');
    expect(first).toBeTruthy();
    await expectNoAxeViolations(page, 'suggestions open');

    // ↓ moves the highlight when there's somewhere to go; Enter adds; focus stays put.
    const options = await listbox.getByRole('option').count();
    await field.press('ArrowDown');
    if (options > 1) expect(await field.getAttribute('aria-activedescendant')).not.toBe(first);
    await field.press('ArrowUp');
    await field.press('Enter');
    await expect(page.getByRole('region', { name: /your kitchen/i }).getByRole('button', { name: 'Remove Courgette' })).toBeVisible();
    await expect(field).toBeFocused();
    await expect(field).toHaveValue('');

    // Typo: "Did you mean", then Esc closes and focus stays in the input.
    await field.fill('corgette');
    await expect(listbox.getByRole('option', { name: /did you mean courgette/i })).toBeVisible();
    await expect(listbox.getByRole('option', { name: /add “corgette” anyway/i })).toBeVisible();
    await expect(field).toHaveAttribute('aria-describedby', /.+/);
    await field.press('Escape');
    await expect(listbox).toBeHidden();
    await expect(field).toHaveAttribute('aria-expanded', 'false');
    await expect(field).toBeFocused();
  });

  test('scan: Esc closes the scanner and focus returns to Scan', async ({ page }) => {
    await openResultsWith(page, ['Egg', 'Rice']);
    const scan = page.getByRole('button', { name: 'Scan a barcode' });
    await scan.click();
    const dialog = page.getByRole('dialog', { name: 'Scan a barcode' });
    await expect(dialog).toBeVisible();
    await expect(scan).toHaveAttribute('aria-expanded', 'true');
    // There's no camera in CI, so the typed-number fallback is what shows.
    await expect(dialog.getByRole('textbox', { name: 'Barcode number' })).toBeVisible();
    await expectNoAxeViolations(page, 'scan open');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(scan).toBeFocused();
  });

  test('speak: listening state at the same height; nothing added until Add', async ({ page }) => {
    await openResultsWith(page, ['Egg']);
    const field = page.locator('.field').first();
    await page.getByRole('button', { name: 'Speak' }).click();
    const add = page.getByRole('button', { name: 'Add 3' });
    await expect(add).toBeVisible();
    expect((await field.boundingBox())?.height).toBe(isMobile(page) ? 56 : 52);
    await expect(page.getByRole('list', { name: 'Heard so far' }).getByText('×2')).toBeVisible();
    const tray = page.getByRole('region', { name: /your kitchen/i });
    await expect(tray.getByRole('button', { name: 'Remove Onion' })).toHaveCount(0);
    await expectNoAxeViolations(page, 'listening');

    await add.click();
    await expect(tray.getByRole('button', { name: 'Remove Onion' })).toBeVisible();
    await expect(tray.getByRole('button', { name: 'Remove Garlic' })).toBeVisible();
    await expect(tray.getByRole('button', { name: 'Remove Chopped tomatoes' })).toBeVisible();
  });

  test('undo: remove, then Undo puts the chip back', async ({ page }) => {
    await openResultsWith(page, ['Egg', 'Onion', 'Garlic']);
    const tray = page.getByRole('region', { name: /your kitchen/i });
    await tray.getByRole('button', { name: 'Remove Onion' }).click();
    await expect(tray.getByRole('button', { name: 'Remove Onion' })).toHaveCount(0);
    // Focus moves to the next chip.
    await expect(tray.getByRole('button', { name: 'Remove Garlic' })).toBeFocused();
    await expect(page.getByText('Onion removed.', { exact: false }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(tray.getByRole('button', { name: 'Remove Onion' })).toBeVisible();
    // Still only the one polite live region (Next's own route announcer is separate).
    await expect(page.locator('[aria-live="polite"]')).toHaveCount(1);
  });
});
