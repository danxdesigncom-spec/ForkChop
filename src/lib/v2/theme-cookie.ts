/**
 * Appearance preference for the v2 UI: System / Light / Dark.
 *
 * Shared by the root layout (server, reads the cookie for first paint) and the
 * client hook in theme-preference.ts (writes it). Kept free of React and of
 * browser globals so both sides, and the tests, can import it.
 */

export const THEME_COOKIE = 'fc-theme';

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** One year, in seconds. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Anything unexpected (missing, tampered, old value) falls back to `system`. */
export function parseThemePreference(raw: string | null | undefined): ThemePreference {
  const value = raw?.trim().toLowerCase();
  return (THEME_PREFERENCES as readonly string[]).includes(value ?? '')
    ? (value as ThemePreference)
    : 'system';
}

/**
 * The `data-theme` attribute for <html>. `system` omits it so the CSS falls
 * back to `prefers-color-scheme`.
 */
export function themeAttribute(preference: ThemePreference): 'light' | 'dark' | undefined {
  return preference === 'system' ? undefined : preference;
}

/** Not HttpOnly: the client writes it. SameSite=Lax, site-wide, one year. */
export function serializeThemeCookie(preference: ThemePreference): string {
  return `${THEME_COOKIE}=${preference}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`;
}
