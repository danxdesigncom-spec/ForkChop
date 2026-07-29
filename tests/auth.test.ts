import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Auth tests focus on the two places a mistake would be dangerous or invisible:
 * the open-redirect guard on the callback, and the merge behaviour that decides
 * whether a user's saves survive signing in.
 */

// -------------------------------------------------------- redirect safety

/**
 * Mirrors the guard in src/app/auth/callback/route.ts. `next` arrives on the
 * query string of a link sent by email, so an unchecked redirect would let an
 * attacker sign someone in and bounce them to a lookalike site.
 */
function safeNext(next: string): string {
  return next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

describe('auth callback redirect target', () => {
  it('allows same-origin absolute paths', () => {
    expect(safeNext('/')).toBe('/');
    expect(safeNext('/recipes/shakshuka')).toBe('/recipes/shakshuka');
  });

  it('rejects absolute URLs to another origin', () => {
    expect(safeNext('https://evil.example/phish')).toBe('/');
    expect(safeNext('http://evil.example')).toBe('/');
  });

  it('rejects protocol-relative URLs', () => {
    // //evil.example is a valid URL that most naive checks let through.
    expect(safeNext('//evil.example')).toBe('/');
  });

  it('rejects anything not starting with a slash', () => {
    expect(safeNext('evil.example')).toBe('/');
    expect(safeNext('javascript:alert(1)')).toBe('/');
  });
});

// ------------------------------------------------------------ save merging

import { mergeLocalIntoAccount } from '@/lib/saved-recipes';

const mockFetch = (impl: (url: string, init?: RequestInit) => Response) => {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => impl(url, init)));
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mergeLocalIntoAccount', () => {
  it('uploads local saves and adopts the returned list', async () => {
    let sentBody: unknown = null;
    mockFetch((_url, init) => {
      sentBody = JSON.parse(String(init?.body));
      return json({ slugs: ['shakshuka', 'ratatouille'] });
    });

    const result = await mergeLocalIntoAccount(['shakshuka']);

    expect(sentBody).toEqual({ merge: ['shakshuka'] });
    expect(result.slugs).toEqual(['shakshuka', 'ratatouille']);
    expect(result.error).toBeNull();
  });

  it('fetches without posting when there is nothing local to merge', async () => {
    const calls: { method?: string }[] = [];
    mockFetch((_url, init) => {
      calls.push({ method: init?.method });
      return json({ slugs: ['ratatouille'] });
    });

    const result = await mergeLocalIntoAccount([]);

    expect(calls).toEqual([{ method: undefined }]); // a plain GET
    expect(result.slugs).toEqual(['ratatouille']);
  });

  it('keeps the local list when the network fails', async () => {
    // The saves are still valid on this device; blanking them would look like
    // data loss for what is only a connectivity problem.
    mockFetch(() => {
      throw new Error('offline');
    });

    const result = await mergeLocalIntoAccount(['shakshuka', 'dal']);

    expect(result.slugs).toEqual(['shakshuka', 'dal']);
    expect(result.error).toBeTruthy();
  });

  it('keeps the local list when the server errors', async () => {
    mockFetch(() => json({ error: 'boom' }, 500));

    const result = await mergeLocalIntoAccount(['shakshuka']);

    expect(result.slugs).toEqual(['shakshuka']);
    expect(result.error).toBeTruthy();
  });

  it('ignores non-string entries in a malformed response', async () => {
    mockFetch(() => json({ slugs: ['ok', 42, null, 'fine'] }));

    const result = await mergeLocalIntoAccount([]);

    expect(result.slugs).toEqual(['ok', 'fine']);
  });
});

// ------------------------------------------------------- error messages

import { describeAuthError } from '@/lib/auth-errors';

describe('describeAuthError', () => {
  it('explains a rate-limited sender', () => {
    expect(describeAuthError('For security purposes, you can only request this after 60 seconds')).toBe(
      'For security purposes, you can only request this after 60 seconds',
    );
    expect(describeAuthError('email rate limit exceeded')).toMatch(/Wait a minute/);
    expect(describeAuthError('over_email_send_rate_limit')).toMatch(/Wait a minute/);
  });

  it('turns raw network failures into something actionable', () => {
    // "fetch failed" is a Node error, not anything the user did.
    expect(describeAuthError('fetch failed')).toMatch(/Check your connection/);
    expect(describeAuthError('ECONNREFUSED')).toMatch(/Check your connection/);
  });

  it('flags misconfiguration as a deployment problem', () => {
    expect(describeAuthError('Invalid API key')).toMatch(/misconfigured/);
  });

  it('passes through messages it has no better wording for', () => {
    expect(describeAuthError('Something specific and useful')).toBe('Something specific and useful');
  });
});
