/**
 * Turns Supabase's error strings into something a person can act on.
 *
 * Raw messages leak implementation detail ("fetch failed" is a Node network
 * error, not anything the user did) and give no hint what to do next.
 *
 * Lives outside the 'use server' module because every export from one of those
 * must be an async Server Action — a plain helper there is a build error.
 */
export function describeAuthError(raw: string): string {
  if (/rate limit|too many|over_email_send_rate/i.test(raw)) {
    return 'Too many sign-in emails just now. Wait a minute and try again.';
  }
  if (/fetch failed|network|ENOTFOUND|ECONNREFUSED|timeout/i.test(raw)) {
    return 'Could not reach the sign-in service. Check your connection and try again.';
  }
  if (/invalid.*api key|jwt|unauthorized/i.test(raw)) {
    return 'Sign-in is misconfigured on this deployment. Check the Supabase keys.';
  }
  if (/signups not allowed|disabled/i.test(raw)) {
    return 'New sign-ups are disabled for this project.';
  }
  return raw;
}
