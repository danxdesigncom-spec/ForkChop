/**
 * ForkChop's cartoon pig. Pure inline SVG — no image assets, scales cleanly,
 * and picks up the pink theme tokens so it works in light and dark.
 *
 * `mood` swaps the expression: `happy` for the header and good news, `hungry`
 * for the empty state, `sad` when a filter leaves nothing to cook.
 */
export function PigMascot({
  size = 48,
  mood = 'happy',
  className = '',
}: {
  size?: number;
  mood?: 'happy' | 'hungry' | 'sad';
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      role="img"
      aria-label="ForkChop pig"
    >
      {/* Floppy oval ears, drawn first so the head overlaps their base.
          Pointed triangles read as a cat; these read as a pig. */}
      <g fill="var(--pig-dark)">
        <ellipse cx="13" cy="18" rx="7.5" ry="10" transform="rotate(-28 13 18)" />
        <ellipse cx="51" cy="18" rx="7.5" ry="10" transform="rotate(28 51 18)" />
      </g>
      <g fill="var(--pig-inner)">
        <ellipse cx="14" cy="19" rx="3.6" ry="5.4" transform="rotate(-28 14 19)" />
        <ellipse cx="50" cy="19" rx="3.6" ry="5.4" transform="rotate(28 50 19)" />
      </g>

      {/* head */}
      <ellipse cx="32" cy="36" rx="25" ry="21" fill="var(--pig-body)" />

      {/* blush */}
      <ellipse cx="12" cy="40" rx="5" ry="3.5" fill="var(--pig-blush)" opacity="0.7" />
      <ellipse cx="52" cy="40" rx="5" ry="3.5" fill="var(--pig-blush)" opacity="0.7" />

      {/* eyes */}
      {mood === 'happy' ? (
        <>
          <path
            d="M17 31 Q22 26 27 31"
            stroke="var(--pig-ink)"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M37 31 Q42 26 47 31"
            stroke="var(--pig-ink)"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
        </>
      ) : (
        <>
          <ellipse cx="22" cy="30" rx="3.1" ry="3.6" fill="var(--pig-ink)" />
          <ellipse cx="42" cy="30" rx="3.1" ry="3.6" fill="var(--pig-ink)" />
          <circle cx="23.2" cy="28.8" r="1.15" fill="#fff" />
          <circle cx="43.2" cy="28.8" r="1.15" fill="#fff" />
        </>
      )}

      {/* snout — the big giveaway, so it gets plenty of room */}
      <ellipse cx="32" cy="44" rx="13.5" ry="10" fill="var(--pig-snout)" />
      <ellipse
        cx="32"
        cy="44"
        rx="13.5"
        ry="10"
        fill="none"
        stroke="var(--pig-ink)"
        strokeWidth="1"
        opacity="0.18"
      />
      <ellipse cx="26.8" cy="44" rx="2.6" ry="3.8" fill="var(--pig-ink)" opacity="0.8" />
      <ellipse cx="37.2" cy="44" rx="2.6" ry="3.8" fill="var(--pig-ink)" opacity="0.8" />

      {/* mouth, tucked under the snout */}
      {mood === 'sad' ? (
        <path
          d="M26 56 Q32 52 38 56"
          stroke="var(--pig-ink)"
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
          opacity="0.55"
        />
      ) : (
        <path
          d="M26 55 Q32 59 38 55"
          stroke="var(--pig-ink)"
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
          opacity="0.55"
        />
      )}
    </svg>
  );
}
