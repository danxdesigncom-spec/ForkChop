import { describe, expect, it } from 'vitest';
import { paginateBySection } from '@/lib/pagination';
import type { MatchStatus, RecipeMatch } from '@/lib/types';

/**
 * paginateBySection walks status sections in priority order and fills a
 * reveal budget. These tests pin the priority ordering, the "empty section"
 * behaviour, and the exhaustion cases — the three things a subtle bug would
 * hide.
 */

const ORDER: MatchStatus[] = ['ready', 'almost', 'stretch'];

/** Just enough shape for the paginator; the actual RecipeMatch is larger. */
const fake = (id: string): RecipeMatch =>
  ({ recipe: { id }, score: 1, coverage: 1, status: 'ready', have: [], missing: [], optionalMissing: [], assumedStaples: [], usedPantryIds: [] }) as unknown as RecipeMatch;

function sections(counts: { ready?: number; almost?: number; stretch?: number }) {
  const map = new Map<MatchStatus, RecipeMatch[]>();
  for (const [status, count] of Object.entries(counts)) {
    map.set(
      status as MatchStatus,
      Array.from({ length: count as number }, (_, i) => fake(`${status}-${i}`)),
    );
  }
  return map;
}

describe('paginateBySection', () => {
  it('fills Ready before Almost before Stretch', () => {
    const { visible, totalShown } = paginateBySection(
      sections({ ready: 3, almost: 3, stretch: 3 }),
      ORDER,
      5,
    );
    expect(visible.get('ready')).toHaveLength(3);
    expect(visible.get('almost')).toHaveLength(2);
    expect(visible.has('stretch')).toBe(false);
    expect(totalShown).toBe(5);
  });

  it('reports the true total across every section', () => {
    const { totalAvailable } = paginateBySection(
      sections({ ready: 3, almost: 3, stretch: 5 }),
      ORDER,
      1,
    );
    // Total isn't affected by the reveal budget — pagination shows how much
    // is behind the "Show more" button, not just what's on screen.
    expect(totalAvailable).toBe(11);
  });

  it('serves everything when the budget exceeds the total', () => {
    const { visible, totalShown, totalAvailable } = paginateBySection(
      sections({ ready: 2, almost: 1 }),
      ORDER,
      100,
    );
    expect(totalShown).toBe(3);
    expect(totalAvailable).toBe(3);
    expect(visible.get('ready')).toHaveLength(2);
    expect(visible.get('almost')).toHaveLength(1);
  });

  it('shows nothing for a budget of zero', () => {
    const { visible, totalShown } = paginateBySection(sections({ ready: 3 }), ORDER, 0);
    expect(totalShown).toBe(0);
    expect(visible.size).toBe(0);
  });

  it('skips missing sections without consuming budget', () => {
    // No "almost" bucket at all — the paginator should walk past it, not
    // silently spend one of the 5 slots on the empty section.
    const { visible, totalShown } = paginateBySection(
      sections({ ready: 3, stretch: 5 }),
      ORDER,
      5,
    );
    expect(visible.get('ready')).toHaveLength(3);
    expect(visible.get('stretch')).toHaveLength(2);
    expect(totalShown).toBe(5);
  });

  it('treats a negative budget the same as zero rather than crashing', () => {
    const { visible, totalShown } = paginateBySection(sections({ ready: 3 }), ORDER, -5);
    expect(totalShown).toBe(0);
    expect(visible.size).toBe(0);
  });
});
