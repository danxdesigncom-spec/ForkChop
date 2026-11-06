import { describe, expect, it } from 'vitest';
import { BADGE_TONE, badgeBand, matchDescription, matchPercent } from '@/lib/v2/match-badge';
import { scoreBand } from '@/lib/theme';

describe('MatchBadge bands', () => {
  it('matches scoreBand at and around every threshold', () => {
    for (const c of [0, 0.3, 0.549, 0.55, 0.7, 0.849, 0.85, 0.9, 1]) {
      expect(badgeBand(c)).toBe(scoreBand(c));
    }
  });

  it('maps Ready, Almost and Stretch to brand, saffron and thyme', () => {
    expect(BADGE_TONE[badgeBand(0.9)].stroke).toBe('var(--brand)');
    expect(BADGE_TONE[badgeBand(0.6)].stroke).toBe('var(--saffron)');
    expect(BADGE_TONE[badgeBand(0.2)].stroke).toBe('var(--muted)');
  });
});

describe('matchPercent', () => {
  it('rounds and clamps', () => {
    expect(matchPercent(0.876)).toBe(88);
    expect(matchPercent(1.4)).toBe(100);
    expect(matchPercent(-1)).toBe(0);
    expect(matchPercent(Number.NaN)).toBe(0);
  });
});

describe('matchDescription', () => {
  it('reads like the accessibility spec', () => {
    expect(matchDescription(0.88, ['Basil'])).toBe('88 percent match. Missing 1: Basil.');
    expect(matchDescription(1, [])).toBe('100 percent match. Nothing missing.');
    expect(matchDescription(0.42, ['Red pepper', 'Cumin'])).toBe('42 percent match. Missing 2: Red pepper, Cumin.');
  });
});
