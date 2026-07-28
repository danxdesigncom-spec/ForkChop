import { formatPercent } from '@/lib/format';
import { SCORE_COLOR, scoreBand } from '@/lib/theme';

/**
 * Progress ring showing how much of a recipe the pantry covers, coloured as a
 * traffic light: green when you have nearly everything, amber when you're part
 * way, red when you're a long way off.
 */
export function MatchRing({ value, size = 52 }: { value: number; size?: number }) {
  const clamped = Math.max(0, Math.min(1, value));
  const band = scoreBand(clamped);
  const { fg, soft } = SCORE_COLOR[band];

  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped);

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${formatPercent(clamped)} of the ingredients for this recipe`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill={soft} stroke="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={fg}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 300ms ease, stroke 300ms ease' }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums"
        style={{ color: fg }}
      >
        {Math.round(clamped * 100)}%
      </span>
    </div>
  );
}
