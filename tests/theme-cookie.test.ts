import { describe, expect, it } from 'vitest';
import {
  THEME_COOKIE_MAX_AGE,
  parseThemePreference,
  serializeThemeCookie,
  themeAttribute,
} from '@/lib/v2/theme-cookie';

describe('parseThemePreference', () => {
  it('accepts the three choices, any casing', () => {
    expect(parseThemePreference('light')).toBe('light');
    expect(parseThemePreference(' DARK ')).toBe('dark');
    expect(parseThemePreference('system')).toBe('system');
  });

  it('falls back to system for anything else', () => {
    expect(parseThemePreference(undefined)).toBe('system');
    expect(parseThemePreference(null)).toBe('system');
    expect(parseThemePreference('')).toBe('system');
    expect(parseThemePreference('sepia')).toBe('system');
  });
});

describe('themeAttribute', () => {
  it('omits the attribute for system so the OS decides', () => {
    expect(themeAttribute('system')).toBeUndefined();
    expect(themeAttribute('light')).toBe('light');
    expect(themeAttribute('dark')).toBe('dark');
  });
});

describe('serializeThemeCookie', () => {
  it('is site-wide, one year, SameSite=Lax and not HttpOnly', () => {
    const cookie = serializeThemeCookie('dark');
    expect(cookie).toContain('fc-theme=dark');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain(`Max-Age=${THEME_COOKIE_MAX_AGE}`);
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toMatch(/HttpOnly/i);
  });
});
