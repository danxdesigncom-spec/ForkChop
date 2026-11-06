import { describe, expect, it } from 'vitest';
import { pageItems, pageWindow, showingLabel } from '@/lib/v2/pagination';

describe('pageWindow', () => {
  it('computes the range for the first page', () => {
    const w = pageWindow(21, 6, 1);
    expect(w).toMatchObject({ page: 1, totalPages: 4, from: 1, to: 6, total: 21, hasPrevious: false, hasNext: true });
  });

  it('computes a short last page', () => {
    const w = pageWindow(21, 6, 4);
    expect(w).toMatchObject({ page: 4, from: 19, to: 21, hasPrevious: true, hasNext: false });
  });

  it('clamps out-of-range and junk pages', () => {
    expect(pageWindow(21, 6, 99).page).toBe(4);
    expect(pageWindow(21, 6, 0).page).toBe(1);
    expect(pageWindow(21, 6, -3).page).toBe(1);
    expect(pageWindow(21, 6, Number.NaN).page).toBe(1);
  });

  it('disables both ends when everything fits on one page', () => {
    const w = pageWindow(5, 6, 1);
    expect(w.totalPages).toBe(1);
    expect(w.hasPrevious).toBe(false);
    expect(w.hasNext).toBe(false);
  });

  it('handles no results', () => {
    const w = pageWindow(0, 6, 1);
    expect(w.totalPages).toBe(1);
    expect(w.hasPrevious).toBe(false);
    expect(w.hasNext).toBe(false);
    expect(showingLabel(w)).toBe('No recipes to show');
  });
});

describe('showingLabel', () => {
  it('reads like the design', () => {
    expect(showingLabel(pageWindow(21, 6, 1))).toBe('Showing 1–6 of 21');
    expect(showingLabel(pageWindow(21, 6, 4))).toBe('Showing 19–21 of 21');
  });
});

describe('pageItems', () => {
  const pages = (items: ReturnType<typeof pageItems>) =>
    items.map((i) => (i.kind === 'page' ? i.page : '…'));

  it('lists every page when there are few', () => {
    expect(pages(pageItems(1, 4))).toEqual([1, 2, 3, 4]);
  });

  it('always keeps the first and last page, with gaps between', () => {
    expect(pages(pageItems(6, 12))).toEqual([1, '…', 5, 6, 7, '…', 12]);
  });

  it('shows a page rather than a gap of one', () => {
    expect(pages(pageItems(3, 12))).toEqual([1, 2, 3, 4, '…', 12]);
  });

  it('marks exactly one page as current-able per number', () => {
    const nums = pages(pageItems(10, 12)).filter((p) => p !== '…');
    expect(new Set(nums).size).toBe(nums.length);
    expect(nums).toContain(10);
  });
});
