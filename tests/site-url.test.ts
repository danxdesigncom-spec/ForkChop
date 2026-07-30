import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveSiteOrigin } from '@/lib/site-url';

/**
 * The magic-link redirect target must never depend on the incoming request
 * when a pinned canonical URL exists, because the "leak" that broke this in
 * production was Vercel Preview URLs bleeding into email links.
 *
 * These tests pin exactly that: NEXT_PUBLIC_SITE_URL wins over every header,
 * and the header fallback still works locally when the env var isn't set.
 */

function makeHeaders(entries: Record<string, string> = {}) {
  const map = new Map(Object.entries(entries).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name: string) => map.get(name.toLowerCase()) ?? null };
}

afterEach(() => vi.unstubAllEnvs());

describe('resolveSiteOrigin — pinning', () => {
  it('returns NEXT_PUBLIC_SITE_URL when set, ignoring every header', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://fork-chop.vercel.app');
    // Deliberately hostile headers — a preview URL, a spoofed origin.
    const headers = makeHeaders({
      origin: 'https://fork-chop-attacker.vercel.app',
      'x-forwarded-host': 'evil.example',
      'x-forwarded-proto': 'https',
    });
    expect(resolveSiteOrigin(headers)).toBe('https://fork-chop.vercel.app');
  });

  it('strips trailing slashes so /auth/callback isn’t doubled up', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://fork-chop.vercel.app/');
    expect(resolveSiteOrigin(makeHeaders())).toBe('https://fork-chop.vercel.app');
  });

  it('treats whitespace and empty string as "unset"', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '   ');
    expect(resolveSiteOrigin(makeHeaders({ origin: 'http://localhost:3000' }))).toBe(
      'http://localhost:3000',
    );
  });
});

describe('resolveSiteOrigin — header fallback (unpinned)', () => {
  it('uses the Origin header when present', () => {
    expect(resolveSiteOrigin(makeHeaders({ origin: 'http://localhost:3000' }))).toBe(
      'http://localhost:3000',
    );
  });

  it('falls back to x-forwarded-host + proto when Origin is absent', () => {
    expect(
      resolveSiteOrigin(
        makeHeaders({ 'x-forwarded-host': 'fork-chop.vercel.app', 'x-forwarded-proto': 'https' }),
      ),
    ).toBe('https://fork-chop.vercel.app');
  });

  it('falls back to Host when neither Origin nor x-forwarded-host is set', () => {
    expect(resolveSiteOrigin(makeHeaders({ host: 'fork-chop.vercel.app' }))).toBe(
      'https://fork-chop.vercel.app',
    );
  });

  it('assumes http for localhost so dev doesn’t break', () => {
    expect(resolveSiteOrigin(makeHeaders({ host: 'localhost:3000' }))).toBe('http://localhost:3000');
  });

  it('returns an empty string when nothing at all is available', () => {
    // Belt-and-braces — the caller decides whether that's fatal.
    expect(resolveSiteOrigin(makeHeaders())).toBe('');
  });
});
