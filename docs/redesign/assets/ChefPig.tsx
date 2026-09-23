/**
 * Chef Pig: ForkChop's logo mark and mascot (v2).
 *
 * - `full`: the outlined mark used in the header, empty states and success moments.
 * - `solid`: outline-free, for small sizes (≤32px) and on the brand-coloured app tile.
 *
 * Only the eyes change between expressions, so the mark always stays recognisable:
 *   default: header and anywhere neutral
 *   happy: ready to cook, recipe saved
 *   wink: basket sent ("Chop chop!")
 *   thinking: searching, loading, empty basket / no ingredients
 *   oops: no matches, errors
 *
 * Theme-aware through CSS variables from tokens-v2.css (--pig-ear, --pig-outline); the
 * fallbacks are the light values. Decorative by default: pass `title` to make it
 * meaningful to screen readers (e.g. as the only content of a link).
 */
import type { SVGProps } from 'react';

export type ChefPigExpression = 'default' | 'happy' | 'wink' | 'thinking' | 'oops';

type Props = {
  size?: number;
  expression?: ChefPigExpression;
  variant?: 'full' | 'solid';
  /** Accessible name. Omit for decorative use (next to the visible "forkchop" wordmark). */
  title?: string;
} & Omit<SVGProps<SVGSVGElement>, 'children'>;

const FOREST = '#1F5F45';
const BLUSH = '#FBE3E1';
const RADISH = '#E4717A';
const EAR = `var(--pig-ear, ${FOREST})`;
const OUTLINE = `var(--pig-outline, ${FOREST})`;

function Eyes({ expression }: { expression: ChefPigExpression }) {
  const arc = (x: number) => `M${x} 30.2c1-1.6 3-1.6 4 0`;
  const stroke = { fill: 'none', stroke: FOREST, strokeWidth: 1.8, strokeLinecap: 'round' as const };
  switch (expression) {
    case 'happy':
      return <path d={`${arc(17)}${arc(27)}`} {...stroke} />;
    case 'wink':
      return (
        <>
          <circle cx={19} cy={29.5} r={1.7} fill={FOREST} />
          <path d={arc(27)} {...stroke} />
        </>
      );
    case 'thinking':
      return (
        <>
          <circle cx={20} cy={28.4} r={1.7} fill={FOREST} />
          <circle cx={30} cy={28.4} r={1.7} fill={FOREST} />
        </>
      );
    case 'oops':
      return (
        <>
          <path d="M16.8 26.6l3.6 1.1M31.2 26.6l-3.6 1.1" fill="none" stroke={FOREST} strokeWidth={1.6} strokeLinecap="round" />
          <circle cx={19} cy={30} r={1.6} fill={FOREST} />
          <circle cx={29} cy={30} r={1.6} fill={FOREST} />
        </>
      );
    default:
      return (
        <>
          <circle cx={19} cy={29.5} r={1.7} fill={FOREST} />
          <circle cx={29} cy={29.5} r={1.7} fill={FOREST} />
        </>
      );
  }
}

export function ChefPig({ size = 40, expression = 'default', variant = 'full', title, ...rest }: Props) {
  const a11y = title ? { role: 'img' as const, 'aria-label': title } : { 'aria-hidden': true as const };

  if (variant === 'solid') {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" {...a11y} {...rest}>
        <path d="M11 24.5L8.3 15.2L16.8 18.6Z" fill="#F6B8BD" />
        <path d="M37 24.5L39.7 15.2L31.2 18.6Z" fill="#F6B8BD" />
        <circle cx={24} cy={31} r={13.5} fill={BLUSH} />
        <path d="M14 17.4C10.5 17.4 9.5 11.6 13 10.1C13.5 5.6 19.5 4.6 21.5 7.6C23.5 3.6 30.5 4.6 31 8.6C35.5 8.1 37.5 14.1 34 17.4Z" fill="#FFFFFF" />
        <rect x={13.6} y={18.4} width={20.8} height={4.4} rx={1.2} fill="#FFFFFF" />
        <circle cx={19} cy={29.8} r={2} fill={FOREST} />
        <circle cx={29} cy={29.8} r={2} fill={FOREST} />
        <ellipse cx={24} cy={36} rx={6.2} ry={4.6} fill={RADISH} />
        <ellipse cx={21.8} cy={36} rx={1.1} ry={1.6} fill={FOREST} />
        <ellipse cx={26.2} cy={36} rx={1.1} ry={1.6} fill={FOREST} />
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" {...a11y} {...rest}>
      <path d="M11 24.5L8.3 15.2L16.8 18.6Z" fill={EAR} />
      <path d="M37 24.5L39.7 15.2L31.2 18.6Z" fill={EAR} />
      <circle cx={24} cy={31} r={13.5} fill={BLUSH} stroke={OUTLINE} strokeWidth={2.4} />
      <circle cx={16.2} cy={34.6} r={2.1} fill={RADISH} fillOpacity={0.35} />
      <circle cx={31.8} cy={34.6} r={2.1} fill={RADISH} fillOpacity={0.35} />
      <path
        d="M14 17.2C10.5 17.2 9.5 11.6 13 10.1C13.5 5.6 19.5 4.6 21.5 7.6C23.5 3.6 30.5 4.6 31 8.6C35.5 8.1 37.5 14.1 34 17.2Z"
        fill="#FFFFFF"
        stroke={FOREST}
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
      <rect x={14} y={16.7} width={20} height={5} rx={1.2} fill="#FFFFFF" stroke={FOREST} strokeWidth={2.2} />
      <Eyes expression={expression} />
      <ellipse cx={24} cy={35.6} rx={5.6} ry={4.1} fill={RADISH} />
      <ellipse cx={22} cy={35.6} rx={0.95} ry={1.45} fill={FOREST} />
      <ellipse cx={26} cy={35.6} rx={0.95} ry={1.45} fill={FOREST} />
    </svg>
  );
}

/** Header lockup: chef + "fork" (ink) "chop" (brand). The link carries the name, so the SVG stays decorative. */
export function ForkChopWordmark({ size = 40 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <ChefPig size={size} />
      <span className="font-display text-[26px] font-semibold tracking-[-0.02em] text-foreground">
        fork<span className="text-brand">chop</span>
      </span>
    </span>
  );
}
