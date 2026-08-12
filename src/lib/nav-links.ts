import type { FeatureFlags } from './flags';

export interface NavLink {
  href: string;
  label: string;
  emoji: string;
  /** Short one-liner shown under the label in the menu. */
  blurb?: string;
}

/**
 * Single source of truth for what shows in the header hamburger menu.
 *
 * Home is always in — the menu is the way back to the app from any
 * content page. Everything else depends on its feature flag, so a
 * disabled page never gets an orphan link pointing to a 404.
 */
export function buildNavLinks(flags: FeatureFlags): NavLink[] {
  const links: NavLink[] = [
    { href: '/', label: 'Home', emoji: '🍳', blurb: 'Cook what you already have.' },
  ];

  if (flags.aboutPage) {
    links.push({
      href: '/about',
      label: 'About',
      emoji: '📖',
      blurb: 'What ForkChop is, and what it is not.',
    });
  }
  if (flags.staplesPage) {
    links.push({
      href: '/staples',
      label: 'Staples',
      emoji: '🧂',
      blurb: 'Ingredients we assume you already have.',
    });
  }
  if (flags.privacyPage) {
    links.push({
      href: '/privacy',
      label: 'Privacy',
      emoji: '🔒',
      blurb: 'How your data is handled.',
    });
  }

  return links;
}
