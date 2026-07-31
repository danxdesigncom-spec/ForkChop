/**
 * Feature flags.
 *
 * Every flag is read at request time from a NEXT_PUBLIC_ env var, so the same
 * build behaves differently across Production, Preview and Development. If a
 * feature breaks in prod, you flip its env var to `false` in Vercel and
 * redeploy — no code changes, no revert, no dependency chain to unpick.
 *
 * Server components and route handlers must import `getFlags()` and pass the
 * result down; client components read the same object via a prop so they get
 * the same values as the initial server render (no hydration mismatch).
 *
 * Adding a flag
 *   1. Add a field to `FeatureFlags`.
 *   2. Add the default to the DEFAULTS map below — start at `false` while
 *      the feature soaks, flip to `true` once it's the intended experience.
 *   3. Add its env var name to the ENV_VARS map.
 *   4. Document the variable in `.env.example` and the deploy notes.
 *   5. Gate the feature: `if (!flags.myFeature) return null;`
 *
 * The names are `NEXT_PUBLIC_FEATURE_*` so it's obvious in the Vercel
 * dashboard what these are for. They ship to the browser bundle, which is
 * fine — a flag name is not a secret and giving both server and client the
 * same view is the whole point.
 */

export interface FeatureFlags {
  /** Kroger deep-link checkout option. */
  kroger: boolean;
  /** Instacart real deep-link checkout (replaces the not-connected stub). */
  instacart: boolean;
  /** Walmart+ checkout — kept for backward compatibility while it's still on. */
  walmart: boolean;
  /** Recipe ratings, aggregated across all users. */
  ratings: boolean;
  /** About page, in the site footer. */
  aboutPage: boolean;
  /** Privacy policy page, in the site footer. */
  privacyPage: boolean;
  /** Staple ingredients reference page. */
  staplesPage: boolean;
  /** Group My Recipes by meal type / ingredient match. */
  savedGrouping: boolean;
  /** Paginate results with infinite scroll. */
  pagination: boolean;
  /** Simplified sidebar: allergies + dislikes visible, other filters tucked into an "Additional filters" accordion. */
  simplifiedSidebar: boolean;
}

/**
 * Defaults. Every feature has soaked long enough on its own PR/branch to be
 * trusted as the intended experience, so all default `true`. The env vars
 * still exist as an override — flipping one to `false` in Vercel takes a
 * feature back out without a code revert if it starts misbehaving.
 */
const DEFAULTS: Record<keyof FeatureFlags, boolean> = {
  walmart: true,
  kroger: true,
  instacart: true,
  ratings: true,
  aboutPage: true,
  privacyPage: true,
  staplesPage: true,
  savedGrouping: true,
  pagination: true,
  simplifiedSidebar: true,
};

/**
 * Env vars. Kept as a mapping rather than a naming convention so it stays
 * obvious what reads what — and grep-friendly.
 */
const ENV_VARS: Record<keyof FeatureFlags, string> = {
  kroger: 'NEXT_PUBLIC_FEATURE_KROGER',
  instacart: 'NEXT_PUBLIC_FEATURE_INSTACART',
  walmart: 'NEXT_PUBLIC_FEATURE_WALMART',
  ratings: 'NEXT_PUBLIC_FEATURE_RATINGS',
  aboutPage: 'NEXT_PUBLIC_FEATURE_ABOUT_PAGE',
  privacyPage: 'NEXT_PUBLIC_FEATURE_PRIVACY_PAGE',
  staplesPage: 'NEXT_PUBLIC_FEATURE_STAPLES_PAGE',
  savedGrouping: 'NEXT_PUBLIC_FEATURE_SAVED_GROUPING',
  pagination: 'NEXT_PUBLIC_FEATURE_PAGINATION',
  simplifiedSidebar: 'NEXT_PUBLIC_FEATURE_SIMPLIFIED_SIDEBAR',
};

/**
 * Truthy values. Deliberately narrow — `true`, `1`, `on`, `yes`. Empty string,
 * `false`, `0`, `off`, `no` and everything else are false. Stops a stray
 * `NEXT_PUBLIC_FEATURE_KROGER=maybe` reading as enabled.
 */
function parseFlag(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  const value = raw.trim().toLowerCase();
  if (value === '') return fallback;
  if (['true', '1', 'on', 'yes'].includes(value)) return true;
  if (['false', '0', 'off', 'no'].includes(value)) return false;
  // Anything unexpected: err on the side of what the code was designed for.
  return fallback;
}

export function getFlags(): FeatureFlags {
  const flags = {} as FeatureFlags;
  for (const key of Object.keys(DEFAULTS) as (keyof FeatureFlags)[]) {
    flags[key] = parseFlag(process.env[ENV_VARS[key]], DEFAULTS[key]);
  }
  return flags;
}

/** Names and defaults, for `.env.example` and the deploy checklist. */
export function describeFlags(): { key: keyof FeatureFlags; envVar: string; default: boolean }[] {
  return (Object.keys(DEFAULTS) as (keyof FeatureFlags)[]).map((key) => ({
    key,
    envVar: ENV_VARS[key],
    default: DEFAULTS[key],
  }));
}
