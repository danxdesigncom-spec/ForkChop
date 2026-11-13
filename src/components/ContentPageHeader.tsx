import Link from 'next/link';
import { PigMascot } from './PigMascot';
import { HamburgerMenu } from './HamburgerMenu';
import { buildNavLinks } from '@/lib/nav-links';
import type { FeatureFlags } from '@/lib/flags';

/**
 * Header for static content pages (privacy, about, staples).
 *
 * A slimmer sibling of SiteHeader — no sign-in state, no view switching, just
 * a clickable wordmark, a way back to the kitchen and the shared hamburger
 * menu. Kept separate so a bug in the account menu can't take down the About
 * page.
 */
export function ContentPageHeader({ title, flags }: { title: string; flags: FeatureFlags }) {
  const navLinks = buildNavLinks(flags);

  return (
    <header className="border-b-4 border-brand bg-surface">
      <div className="relative mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
        <Link href="/" aria-label="ForkChop home" className="flex items-center gap-3 text-left">
          <PigMascot size={44} mood="happy" />
          <span>
            <span className="block text-2xl font-extrabold leading-none tracking-tight">
              Fork<span className="text-brand">Chop</span>
            </span>
            <span className="mt-1 block text-xs font-medium text-muted">{title}</span>
          </span>
        </Link>

        <Link
          href="/"
          className="ml-auto rounded-xl border-2 border-border bg-surface px-3 py-2 text-sm font-semibold hover:border-brand hover:text-brand"
        >
          Back to the kitchen
        </Link>

        <HamburgerMenu links={navLinks} />
      </div>
    </header>
  );
}
