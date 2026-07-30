import type { MatchStatus, RecipeMatch } from './types';

/**
 * Distribute a reveal budget across status sections in priority order.
 *
 * Users care most about "Ready to cook", then "Almost there", then "Stretch".
 * A flat cap of N total matches walks the sections in that order and fills as
 * much as it can — so pagination reveals the best matches first, and long
 * "Almost" runs never squeeze out a Ready match at the top of the list.
 */
export const PAGE_SIZE = 8;

export function paginateBySection(
  sections: Map<MatchStatus, RecipeMatch[]>,
  order: readonly MatchStatus[],
  revealCount: number,
): { visible: Map<MatchStatus, RecipeMatch[]>; totalShown: number; totalAvailable: number } {
  const visible = new Map<MatchStatus, RecipeMatch[]>();
  let remaining = Math.max(0, Math.floor(revealCount));
  let totalShown = 0;
  let totalAvailable = 0;

  for (const status of order) {
    const matches = sections.get(status) ?? [];
    totalAvailable += matches.length;
    if (matches.length === 0) continue;

    const take = Math.min(matches.length, remaining);
    if (take > 0) {
      visible.set(status, matches.slice(0, take));
      totalShown += take;
      remaining -= take;
    }
  }

  return { visible, totalShown, totalAvailable };
}
