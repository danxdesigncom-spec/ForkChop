import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
