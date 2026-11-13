import { ImageResponse } from 'next/og';

/**
 * Social-share preview card.
 *
 * Rendered by Next at request time and served at `/opengraph-image` (plus the
 * matching `/twitter-image` from the sibling file). iMessage, Slack, X,
 * Facebook and LinkedIn all pull this image via the `og:image` / `twitter:image`
 * meta tags emitted by the root layout.
 *
 * The pig is inline JSX rather than an <img> so there is no image asset to
 * ship or cache-bust. Colours are the concrete values from globals.css because
 * satori (the ImageResponse renderer) does not evaluate CSS custom properties.
 */

export const runtime = 'edge';

export const alt = 'ForkChop — cook what you already have';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const COLOURS = {
  background: '#fde4ee',
  ink: '#7a2447',
  brand: '#bd2f68',
  pigBody: '#f9a8c8',
  pigDark: '#ef7fae',
  pigInner: '#fbc3d9',
  pigSnout: '#f286b3',
  pigBlush: '#ee6fa4',
  pigInk: '#7a2447',
} as const;

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 64,
          padding: 80,
          background: `radial-gradient(circle at 30% 30%, #ffeef5 0%, ${COLOURS.background} 60%, #f7c9dc 100%)`,
          fontFamily: 'sans-serif',
        }}
      >
        <PigCard />
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 560 }}>
          <div
            style={{
              fontSize: 128,
              fontWeight: 800,
              lineHeight: 1,
              color: COLOURS.ink,
              letterSpacing: -4,
            }}
          >
            ForkChop
          </div>
          <div
            style={{
              marginTop: 24,
              fontSize: 40,
              lineHeight: 1.15,
              color: COLOURS.brand,
              fontWeight: 600,
            }}
          >
            Cook what you already have.
          </div>
          <div
            style={{
              marginTop: 28,
              fontSize: 26,
              lineHeight: 1.35,
              color: COLOURS.ink,
              opacity: 0.75,
            }}
          >
            Tell it what is in your kitchen and it finds recipes you can cook tonight.
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}

function PigCard() {
  return (
    <div
      style={{
        width: 440,
        height: 440,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 48,
        background: 'rgba(255, 255, 255, 0.55)',
        boxShadow: '0 30px 60px rgba(122, 36, 71, 0.15)',
      }}
    >
      {/*
        Inline SVG built from the same shapes as src/components/PigMascot.tsx.
        Colours inlined because satori does not resolve CSS variables. Kept in
        sync by hand — the shape is stable enough that this rarely changes.
       */}
      <svg width="360" height="360" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <g fill={COLOURS.pigDark}>
          <ellipse cx="13" cy="18" rx="7.5" ry="10" transform="rotate(-28 13 18)" />
          <ellipse cx="51" cy="18" rx="7.5" ry="10" transform="rotate(28 51 18)" />
        </g>
        <g fill={COLOURS.pigInner}>
          <ellipse cx="14" cy="19" rx="3.6" ry="5.4" transform="rotate(-28 14 19)" />
          <ellipse cx="50" cy="19" rx="3.6" ry="5.4" transform="rotate(28 50 19)" />
        </g>
        <ellipse cx="32" cy="36" rx="25" ry="21" fill={COLOURS.pigBody} />
        <ellipse cx="12" cy="40" rx="5" ry="3.5" fill={COLOURS.pigBlush} opacity="0.7" />
        <ellipse cx="52" cy="40" rx="5" ry="3.5" fill={COLOURS.pigBlush} opacity="0.7" />
        {/* Happy eyes */}
        <path
          d="M17 31 Q22 26 27 31"
          stroke={COLOURS.pigInk}
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M37 31 Q42 26 47 31"
          stroke={COLOURS.pigInk}
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
        <ellipse cx="32" cy="44" rx="13.5" ry="10" fill={COLOURS.pigSnout} />
        <ellipse cx="26.8" cy="44" rx="2.6" ry="3.8" fill={COLOURS.pigInk} opacity="0.8" />
        <ellipse cx="37.2" cy="44" rx="2.6" ry="3.8" fill={COLOURS.pigInk} opacity="0.8" />
        <path
          d="M26 55 Q32 59 38 55"
          stroke={COLOURS.pigInk}
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
          opacity="0.55"
        />
      </svg>
    </div>
  );
}
