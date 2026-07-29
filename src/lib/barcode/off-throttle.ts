/**
 * Cache and throttle for Open Food Facts lookups.
 *
 * OFF allows 15 product requests per minute *per IP*. Because the lookup is
 * proxied (the browser cannot set the required User-Agent), every user shares
 * this server's IP against that one budget — so a handful of people scanning at
 * once could get the deployment rate-limited, or IP-banned.
 *
 * Two defences:
 *   cache    - the same barcode always describes the same product, so repeats
 *              cost nothing. Scanning is bursty and repetitive; this absorbs
 *              most of it.
 *   throttle - a hard ceiling below OFF's, so we degrade with a clear message
 *              instead of hammering them into a ban.
 *
 * Both are per-instance and lost on cold start. That is acceptable: the data is
 * public and read-only, so the worst case is a few extra upstream requests.
 * Anything shared across instances would need Redis, which is not warranted at
 * this scale.
 */

export interface CachedProduct {
  value: unknown;
  expiresAt: number;
}

/** Product facts change rarely; an hour is conservative. */
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 500;

/** Deliberately under OFF's 15, leaving headroom for other traffic. */
const MAX_REQUESTS_PER_WINDOW = 10;
const WINDOW_MS = 60 * 1000;

const cache = new Map<string, CachedProduct>();
let windowStartedAt = 0;
let requestsInWindow = 0;

export function getCached(code: string): unknown | null {
  const hit = cache.get(code);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(code);
    return null;
  }
  return hit.value;
}

export function setCached(code: string, value: unknown): void {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(code, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

export interface ThrottleDecision {
  allowed: boolean;
  /** Seconds until the window resets, for a Retry-After header. */
  retryAfterSeconds: number;
}

/**
 * Fixed-window counter. Coarser than a sliding window, but the failure mode
 * here is only a short wait, and it needs no per-request bookkeeping.
 */
export function takeToken(now = Date.now()): ThrottleDecision {
  if (now - windowStartedAt >= WINDOW_MS) {
    windowStartedAt = now;
    requestsInWindow = 0;
  }

  if (requestsInWindow >= MAX_REQUESTS_PER_WINDOW) {
    const retryAfterSeconds = Math.max(1, Math.ceil((windowStartedAt + WINDOW_MS - now) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  requestsInWindow += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Test helper — resets both cache and window. */
export function resetThrottle(): void {
  cache.clear();
  windowStartedAt = 0;
  requestsInWindow = 0;
}

export function throttleStats() {
  return { cached: cache.size, requestsInWindow, maxPerWindow: MAX_REQUESTS_PER_WINDOW };
}
