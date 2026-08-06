import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAdminEmail, parseAdminEmails } from '@/lib/admin/auth';

/**
 * The admin allowlist is the authorisation gate for the whole /admin surface.
 * These tests pin exactly what counts as being on the list, so a whitespace
 * quirk or an accidental case-sensitive compare cannot lock the real admin
 * out — or, worse, let the wrong email in.
 */

afterEach(() => vi.unstubAllEnvs());

describe('parseAdminEmails', () => {
  it('returns an empty list for empty / undefined input', () => {
    expect(parseAdminEmails(undefined)).toEqual([]);
    expect(parseAdminEmails('')).toEqual([]);
    expect(parseAdminEmails('   ')).toEqual([]);
  });

  it('splits on commas, trims, lowercases, and drops blanks', () => {
    expect(parseAdminEmails('  Alice@ex.com , BOB@ex.com ,, , carol@Ex.com')).toEqual([
      'alice@ex.com',
      'bob@ex.com',
      'carol@ex.com',
    ]);
  });
});

describe('isAdminEmail', () => {
  it('is false for null / undefined / empty', () => {
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
    expect(isAdminEmail('')).toBe(false);
    expect(isAdminEmail('   ')).toBe(false);
  });

  it('is false when ADMIN_EMAILS is unset', () => {
    expect(isAdminEmail('anyone@ex.com')).toBe(false);
  });

  it('matches case-insensitively', () => {
    vi.stubEnv('ADMIN_EMAILS', 'alice@ex.com,bob@ex.com');
    expect(isAdminEmail('ALICE@EX.COM')).toBe(true);
    expect(isAdminEmail('  bob@ex.com  ')).toBe(true);
    expect(isAdminEmail('mallory@ex.com')).toBe(false);
  });

  it('tolerates messy env formatting without letting substrings match', () => {
    vi.stubEnv('ADMIN_EMAILS', ' , admin@ex.com , ');
    expect(isAdminEmail('admin@ex.com')).toBe(true);
    // Substring of an admin address must not be counted as an admin.
    expect(isAdminEmail('admin')).toBe(false);
    expect(isAdminEmail('ex.com')).toBe(false);
  });
});
