import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidBarcode } from '@/lib/barcode/detector';
import { getCached, resetThrottle, setCached, takeToken, throttleStats } from '@/lib/barcode/off-throttle';
import { mergeLocalPantry } from '@/lib/pantry-sync';

describe('isValidBarcode', () => {
  it('accepts the real retail formats', () => {
    expect(isValidBarcode('12345678')).toBe(true); // EAN-8
    expect(isValidBarcode('5000157024671')).toBe(true); // EAN-13
    expect(isValidBarcode('12345678901234')).toBe(true); // GTIN-14
  });

  it('rejects anything the lookup would only waste a request on', () => {
    expect(isValidBarcode('1234567')).toBe(false); // too short
    expect(isValidBarcode('123456789012345')).toBe(false); // too long
    expect(isValidBarcode('50001570abc71')).toBe(false);
    expect(isValidBarcode('5000 157 0246')).toBe(false);
    expect(isValidBarcode('')).toBe(false);
  });

  it('tolerates surrounding whitespace', () => {
    expect(isValidBarcode('  5000157024671  ')).toBe(true);
  });
});

describe('Open Food Facts cache', () => {
  beforeEach(() => resetThrottle());

  it('returns what was stored', () => {
    setCached('5000157024671', { found: true });
    expect(getCached('5000157024671')).toEqual({ found: true });
  });

  it('misses on an unseen barcode', () => {
    expect(getCached('0000000000000')).toBeNull();
  });

  it('expires entries once past their TTL', () => {
    setCached('123', { found: true });
    // An hour and a second later.
    vi.setSystemTime(Date.now() + 60 * 60 * 1000 + 1000);
    expect(getCached('123')).toBeNull();
    vi.useRealTimers();
  });
});

describe('Open Food Facts throttle', () => {
  beforeEach(() => resetThrottle());

  it('allows requests up to the ceiling', () => {
    const { maxPerWindow } = throttleStats();
    for (let i = 0; i < maxPerWindow; i++) {
      expect(takeToken().allowed).toBe(true);
    }
  });

  it('stops below Open Food Facts’ own 15/min limit', () => {
    // Sharing one server IP across all users is exactly why this exists.
    expect(throttleStats().maxPerWindow).toBeLessThan(15);
  });

  it('refuses once the window is spent, with a retry hint', () => {
    const { maxPerWindow } = throttleStats();
    for (let i = 0; i < maxPerWindow; i++) takeToken();

    const denied = takeToken();
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
    expect(denied.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('opens up again in the next window', () => {
    const start = Date.now();
    const { maxPerWindow } = throttleStats();
    for (let i = 0; i < maxPerWindow; i++) takeToken(start);

    expect(takeToken(start).allowed).toBe(false);
    expect(takeToken(start + 60_001).allowed).toBe(true);
  });
});

// ------------------------------------------------------------ pantry sync

const mockFetch = (impl: (url: string, init?: RequestInit) => Response) => {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => impl(String(url), init)));
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('mergeLocalPantry', () => {
  it('uploads the local pantry and adopts what comes back', async () => {
    let sent: unknown = null;
    mockFetch((_url, init) => {
      sent = JSON.parse(String(init?.body));
      return json({ pantry: ['tahini', 'lemon', 'rice'] });
    });

    const result = await mergeLocalPantry(['tahini', 'lemon']);

    expect(sent).toEqual({
      merge: [
        { rawText: 'tahini', source: 'typed' },
        { rawText: 'lemon', source: 'typed' },
      ],
    });
    expect(result.pantry).toEqual(['tahini', 'lemon', 'rice']);
    expect(result.error).toBeNull();
  });

  it('just fetches when there is nothing local to contribute', async () => {
    const methods: (string | undefined)[] = [];
    mockFetch((_url, init) => {
      methods.push(init?.method);
      return json({ pantry: ['rice'] });
    });

    const result = await mergeLocalPantry([]);

    expect(methods).toEqual([undefined]); // a plain GET
    expect(result.pantry).toEqual(['rice']);
  });

  it('keeps the local pantry when the network fails', async () => {
    // Blanking someone's kitchen over a connectivity blip would read as data loss.
    mockFetch(() => {
      throw new Error('offline');
    });

    const result = await mergeLocalPantry(['tahini', 'lemon']);

    expect(result.pantry).toEqual(['tahini', 'lemon']);
    expect(result.error).toBeTruthy();
  });

  it('keeps the local pantry when the server errors', async () => {
    mockFetch(() => json({ error: 'boom' }, 500));

    const result = await mergeLocalPantry(['tahini']);

    expect(result.pantry).toEqual(['tahini']);
    expect(result.error).toBeTruthy();
  });

  it('ignores non-string entries in a malformed response', async () => {
    mockFetch(() => json({ pantry: ['ok', 7, null, 'fine'] }));
    expect((await mergeLocalPantry([])).pantry).toEqual(['ok', 'fine']);
  });
});
