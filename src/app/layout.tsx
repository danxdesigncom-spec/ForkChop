import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { getFlags } from "@/lib/flags";
import { THEME_COOKIE, parseThemePreference, themeAttribute } from "@/lib/v2/theme-cookie";
import "./globals.css";
// v2 tokens. Every rule is scoped to html[data-brand="v2"], so v1 is untouched.
import "./tokens-v2.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// v2 display face. next/font has to be called at module scope, so it is always
// declared, but its CSS variable is only attached to <html> when the redesign
// flag is on. next/font only takes extra axes on the variable font, so this
// loads the variable weight range plus `opsz` (optical sizing); v2 components
// set font-weight 600 themselves.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
});

/**
 * Absolute URLs for og:image / twitter:image.
 *
 * Social crawlers (iMessage, Slack, X, Facebook) reject relative image URLs,
 * so `metadataBase` is required for the auto-generated meta tags to point at
 * the real host. Pinned to NEXT_PUBLIC_SITE_URL when set (same var that
 * anchors magic-link redirects); dev falls back to localhost.
 */
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '') ||
  'http://localhost:3000';

const title = 'ForkChop — cook what you already have';
const description =
  'Tell ForkChop what is in your kitchen and it finds recipes you can cook tonight, plus the ones you are only an ingredient or two away from.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: 'ForkChop',
    type: 'website',
    url: '/',
    // opengraph-image.tsx is picked up automatically by Next; declaring
    // nothing here lets it drive the tag.
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // v2 tokens hang off `data-brand` (docs/redesign/00-README.md). With the
  // flag off, <html> renders exactly as it did before the redesign.
  const { redesign } = getFlags();

  // Appearance (System / Light / Dark) is a v2 feature. Reading the cookie is
  // a request-time API, so only do it with the flag on: that keeps v1 routes
  // as they were, and v1's CSS ignores data-theme anyway.
  const theme = redesign
    ? themeAttribute(parseThemePreference((await cookies()).get(THEME_COOKIE)?.value))
    : undefined;

  const fontVars = [geistSans.variable, geistMono.variable, redesign ? fraunces.variable : null]
    .filter(Boolean)
    .join(" ");

  return (
    <html
      lang={redesign ? "en-GB" : "en"}
      data-brand={redesign ? "v2" : undefined}
      data-theme={theme}
      className={`${fontVars} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
