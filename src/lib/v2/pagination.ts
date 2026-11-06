/**
 * Page-number maths for the v2 `Pagination` control (`?page=N`).
 *
 * Pure so it unit tests without React. v1's cumulative reveal lives in
 * src/lib/pagination.ts and is untouched.
 */

export type PageItem = { kind: 'page'; page: number } | { kind: 'gap'; key: string };

export interface PageWindow {
  /** 1-based current page, clamped into range. */
  page: number;
  totalPages: number;
  /** 1-based index of the first item shown, or 0 when there are none. */
  from: number;
  /** 1-based index of the last item shown, or 0 when there are none. */
  to: number;
  total: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

export function pageWindow(total: number, pageSize: number, requested: number): PageWindow {
  const safeTotal = Math.max(0, Math.floor(total));
  const size = Math.max(1, Math.floor(pageSize));
  const totalPages = Math.max(1, Math.ceil(safeTotal / size));
  const page = Number.isFinite(requested)
    ? Math.min(totalPages, Math.max(1, Math.floor(requested)))
    : 1;
  const from = safeTotal === 0 ? 0 : (page - 1) * size + 1;
  const to = safeTotal === 0 ? 0 : Math.min(safeTotal, page * size);
  return {
    page,
    totalPages,
    from,
    to,
    total: safeTotal,
    hasPrevious: page > 1,
    hasNext: page < totalPages,
  };
}

/**
 * The numbered buttons to show: always the first and last page, the current
 * page and `siblings` either side, with a gap marker wherever pages are skipped.
 * A gap never stands in for a single page (that page is shown instead).
 */
export function pageItems(page: number, totalPages: number, siblings = 1): PageItem[] {
  const last = Math.max(1, Math.floor(totalPages));
  const current = Math.min(last, Math.max(1, Math.floor(page)));
  const wanted = new Set<number>([1, last]);
  for (let p = current - siblings; p <= current + siblings; p++) {
    if (p >= 1 && p <= last) wanted.add(p);
  }
  const sorted = [...wanted].sort((a, b) => a - b);
  const items: PageItem[] = [];
  let previous = 0;
  for (const p of sorted) {
    if (p - previous === 2) items.push({ kind: 'page', page: p - 1 });
    else if (p - previous > 2) items.push({ kind: 'gap', key: `gap-${previous}-${p}` });
    items.push({ kind: 'page', page: p });
    previous = p;
  }
  return items;
}

/** Status line under the results: "Showing 1–6 of 21". */
export function showingLabel(w: Pick<PageWindow, 'from' | 'to' | 'total'>): string {
  if (w.total === 0) return 'No recipes to show';
  return `Showing ${w.from}–${w.to} of ${w.total}`;
}
