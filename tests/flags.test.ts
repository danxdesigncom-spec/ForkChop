import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeFlags, getFlags } from '@/lib/flags';

/**
 * Flag parsing has to be strict, or a typo in Vercel silently turns something
 * on. These tests pin the accepted truthy/falsy vocabulary in place.
 */

afterEach(() => vi.unstubAllEnvs());

describe('getFlags', () => {
  it('defaults every flag when nothing is set', () => {
    const flags = getFlags();
    // Walmart is the one flag currently defaulted on, because turning it off
    // would silently remove a checkout option that already ships.
    expect(flags.walmart).toBe(true);
    expect(flags.kroger).toBe(false);
    expect(flags.instacart).toBe(false);
    expect(flags.ratings).toBe(false);
  });

  it('reads each flag from its own env var', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_KROGER', 'true');
    vi.stubEnv('NEXT_PUBLIC_FEATURE_INSTACART', 'true');
    const flags = getFlags();
    expect(flags.kroger).toBe(true);
    expect(flags.instacart).toBe(true);
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
    ['', false], // empty string falls through to the default (false for kroger)
  ])('accepts %s as %s', (raw, expected) => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_KROGER', raw);
    expect(getFlags().kroger).toBe(expected);
  });

  it('refuses to enable a flag on an unexpected value', () => {
    // "maybe" reading as on would be surprising and dangerous.
    vi.stubEnv('NEXT_PUBLIC_FEATURE_KROGER', 'maybe');
    expect(getFlags().kroger).toBe(false);

    // A flag with a `true` default should stay on when the value is garbage.
    vi.stubEnv('NEXT_PUBLIC_FEATURE_WALMART', 'perhaps');
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
