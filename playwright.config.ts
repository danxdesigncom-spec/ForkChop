import { defineConfig, devices } from '@playwright/test';

/**
 * v2 accessibility gate (docs/redesign/05-a11y-qa.md).
 *
 * Four projects: desktop/mobile × light/dark. Dark sets both `colorScheme` and
 * the `fc-theme=dark` cookie, so the server's first paint and the CSS media
 * query agree.
 *
 * The app runs signed out on local SQLite data: Supabase, Kroger and
 * Spoonacular are left unset on purpose, and no secrets are needed.
 *
 * `PW_CHROMIUM_PATH` is an optional override for machines that can't download
 * Playwright's own Chromium (sandboxed CI, locked-down laptops). Leave it unset
 * normally.
 */

const PORT = Number(process.env.PORT ?? 3000);
const baseURL = `http://localhost:${PORT}`;
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

const darkCookie = {
  cookies: [
    {
      name: 'fc-theme',
      value: 'dark',
      domain: 'localhost',
      path: '/',
      expires: -1,
      httpOnly: false,
      secure: false,
      sameSite: 'Lax' as const,
    },
  ],
  origins: [],
};

const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } };
// Pixel 7 is Chromium-based, so the one browser covers both sizes.
const mobile = { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } };

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: 'desktop-light', use: { ...desktop, colorScheme: 'light' } },
    { name: 'desktop-dark', use: { ...desktop, colorScheme: 'dark', storageState: darkCookie } },
    { name: 'mobile-light', use: { ...mobile, colorScheme: 'light' } },
    { name: 'mobile-dark', use: { ...mobile, colorScheme: 'dark', storageState: darkCookie } },
  ],
  webServer: {
    command: `npm run build && npm start -- --port ${PORT}`,
    url: baseURL,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_FEATURE_REDESIGN: 'true',
      NEXT_PUBLIC_FEATURE_INGREDIENT_BAR_B: process.env.NEXT_PUBLIC_FEATURE_INGREDIENT_BAR_B ?? 'true',
    },
  },
});
