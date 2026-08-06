/**
 * Admin authorisation.
 *
 * Who is an admin? Whoever appears in the ADMIN_EMAILS env var — comma-
 * separated, case-insensitive, whitespace tolerated. Server-only, because it
 * is the authorisation gate: if the browser could see this list it could
 * rewrite the list.
 *
 * Kept as an env allowlist for now rather than a DB table because:
 *   - No migration or RLS policies needed for a shell PR.
 *   - Admins are set per-environment in Vercel, which matches how the rest of
 *     the feature flags are managed.
 *   - Moving to a DB-backed roles table later means changing this file and
 *     nothing else — every caller goes through `isAdminEmail`.
 */

const ENV_VAR = 'ADMIN_EMAILS';

export function parseAdminEmails(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

export function getAdminEmails(): string[] {
  return parseAdminEmails(process.env[ENV_VAR]);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalised = email.trim().toLowerCase();
  if (!normalised) return false;
  return getAdminEmails().includes(normalised);
}
