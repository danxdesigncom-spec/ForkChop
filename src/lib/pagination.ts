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

/**
 * v2 page numbers. Flattens the sections in `order` (Ready → Almost →
 * Stretch, so the best matches always come first) and returns one page of
 * them. Out-of-range pages clamp to the nearest real page. v1 keeps
 * `paginateBySection`.
 */
export function paginateByPage(
  sections: Map<MatchStatus, RecipeMatch[]>,
  order: readonly MatchStatus[],
  page: number,
  pageSize: number,
): {
  visible: RecipeMatch[];
  page: number;
  pageCount: number;
  /** 1-based index of the first match on this page, 0 when there are none. */
  from: number;
  /** 1-based index of the last match on this page, 0 when there are none. */
  to: number;
  total: number;
} {
  const all = order.flatMap((status) => sections.get(status) ?? []);
  const size = Math.max(1, Math.floor(pageSize));
  const total = all.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const current = Number.isFinite(page) ? Math.min(pageCount, Math.max(1, Math.floor(page))) : 1;
  const start = (current - 1) * size;
  const visible = all.slice(start, start + size);
  return {
    visible,
    page: current,
    pageCount,
    from: total === 0 ? 0 : start + 1,
    to: total === 0 ? 0 : start + visible.length,
    total,
  };
}
