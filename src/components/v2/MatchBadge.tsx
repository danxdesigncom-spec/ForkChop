import { BADGE_TONE, badgeBand, matchDescription, matchPercent } from '@/lib/v2/match-badge';
import { cn } from './cn';

interface Props {
  /** 0–1 importance-weighted coverage, as on RecipeMatch. */
  coverage: number;
  /** Names of required missing ingredients, for the screen-reader text. */
  missing: readonly string[];
  size?: number;
}

const STROKE = 4;

/** 44px progress ring with the percentage in Geist Mono. */
export function MatchBadge({ coverage, missing, size = 44 }: Props) {
  const pct = matchPercent(coverage);
  const tone = BADGE_TONE[badgeBand(coverage)];
  const r = (size - STROKE) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <svg aria-hidden="true" width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-muted)" strokeWidth={STROKE} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone.stroke}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
        />
      </svg>
      <span aria-hidden="true" className={cn('absolute inset-0 flex items-center justify-center font-mono text-xs font-semibold', tone.text)}>
        {pct}
      </span>
      <span className="sr-only">{matchDescription(coverage, missing)}</span>
    </span>
  );
}
