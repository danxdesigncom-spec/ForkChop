import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeFlags, getFlags } from '@/lib/flags';

/**
 * Flag parsing has to be strict, or a typo in Vercel silently turns something
 * on. These tests pin the accepted truthy/falsy vocabulary in place.
 */

afterEach(() => vi.unstubAllEnvs());

describe('getFlags', () => {
  it('defaults every flag on when nothing is set', () => {
    // Every feature has soaked long enough to be the intended experience,
    // so a fresh deploy with no env vars set gets the full app.
    const flags = getFlags();
    expect(flags.walmart).toBe(true);
    expect(flags.kroger).toBe(true);
    expect(flags.instacart).toBe(true);
    expect(flags.ratings).toBe(true);
    expect(flags.aboutPage).toBe(true);
    expect(flags.privacyPage).toBe(true);
    expect(flags.staplesPage).toBe(true);
    expect(flags.savedGrouping).toBe(true);
    expect(flags.pagination).toBe(true);
    expect(flags.admin).toBe(true);
  });

  it('reads each flag from its own env var', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_KROGER', 'false');
    vi.stubEnv('NEXT_PUBLIC_FEATURE_INSTACART', 'false');
    const flags = getFlags();
    expect(flags.kroger).toBe(false);
    expect(flags.instacart).toBe(false);
  });

  it.each([
    ['true', true],
    ['TRUE', true],
    ['True', true],
    ['1', true],
    ['on', true],
    ['yes', true],
    ['  true  ', true],
    ['false', false],
    ['0', false],
    ['off', false],
    ['no', false],
    ['', true], // empty string falls through to the default (true for kroger)
  ])('accepts %s as %s', (raw, expected) => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_KROGER', raw);
    expect(getFlags().kroger).toBe(expected);
  });

  it('falls back to the default on an unexpected value', () => {
    // Garbage never flips the intent — every flag currently defaults to true.
    vi.stubEnv('NEXT_PUBLIC_FEATURE_KROGER', 'perhaps');
    expect(getFlags().kroger).toBe(true);
    vi.stubEnv('NEXT_PUBLIC_FEATURE_WALMART', 'maybe');
    expect(getFlags().walmart).toBe(true);
  });

  it('lets Vercel disable a currently-on flag', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_WALMART', 'false');
    expect(getFlags().walmart).toBe(false);
  });
});

describe('describeFlags', () => {
  it('lists every flag with its env var name and default', () => {
    const rows = describeFlags();
    const walmart = rows.find((r) => r.key === 'walmart');
    expect(walmart).toEqual({ key: 'walmart', envVar: 'NEXT_PUBLIC_FEATURE_WALMART', default: true });
  });

  it('covers the full FeatureFlags surface', () => {
    // Whenever a flag is added, this test forces the docs helper to be
    // updated too — otherwise the .env.example would drift.
    const rows = describeFlags();
    const shape = getFlags();
    expect(rows.map((r) => r.key).sort()).toEqual(Object.keys(shape).sort());
  });
});
