import { scoreBand, type ScoreBand } from '@/lib/theme';

/**
 * v2 `MatchBadge` mapping. Uses the same `scoreBand()` thresholds as v1's
 * `MatchRing`, so a recipe never changes band between the two designs.
 * Ready = brand, Almost = saffron, Stretch = thyme (neutral, not an error).
 */
export const BADGE_TONE: Record<ScoreBand, { stroke: string; text: string }> = {
  high: { stroke: 'var(--brand)', text: 'text-brand-strong' },
  mid: { stroke: 'var(--saffron)', text: 'text-saffron-text' },
  low: { stroke: 'var(--muted)', text: 'text-muted' },
};

export function matchPercent(coverage: number): number {
  if (!Number.isFinite(coverage)) return 0;
  return Math.round(Math.min(1, Math.max(0, coverage)) * 100);
}

export function badgeBand(coverage: number): ScoreBand {
  return scoreBand(coverage);
}

/** Screen-reader text: "88 percent match. Missing 1: Basil." */
export function matchDescription(coverage: number, missing: readonly string[]): string {
  const pct = `${matchPercent(coverage)} percent match.`;
  if (missing.length === 0) return `${pct} Nothing missing.`;
  return `${pct} Missing ${missing.length}: ${missing.join(', ')}.`;
}
