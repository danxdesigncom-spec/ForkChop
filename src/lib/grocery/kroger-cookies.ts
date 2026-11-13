/**
 * Cookie names shared by the two halves of the Kroger OAuth handoff.
 *
 * Kept out of the route files because Next.js route handlers may only export
 * the recognised route exports (GET, POST, dynamic, …) — exporting a constant
 * from one of them is a build error.
 */

export const PENDING_COOKIE = 'kroger_pending_cart';
export const STATE_COOKIE = 'kroger_oauth_state';

/** Ten minutes: plenty of time to sign in to Kroger, short enough to be tidy. */
export const COOKIE_MAX_AGE_SECONDS = 600;
