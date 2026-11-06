'use client';

import { Heart, Menu } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import type { NavLink } from '@/lib/nav-links';
import { useTheme } from '@/lib/v2/theme-preference';
import { THEME_PREFERENCES, type ThemePreference } from '@/lib/v2/theme-cookie';
import { ForkChopWordmark } from './ChefPig';
import { SegmentedControl } from './SegmentedControl';
import { cn } from './cn';
import { useDismiss } from './use-dismiss';

export type View = 'discover' | 'saved';

interface Props {
  view: View;
  onViewChange: (view: View) => void;
  savedCount: number;
  /** Email of the signed-in user, or null when signed out. */
  userEmail: string | null;
  onLogIn: () => void;
  /** Shown in place of Log in when signed in (the existing AccountMenu). */
  account?: ReactNode;
  links: NavLink[];
  /** Compact IngredientField for the results view; shown on desktop only. */
  search?: ReactNode;
  /** id of the results region the skip link jumps to. */
  skipTo?: string;
}

const THEME_LABELS: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

/**
 * v2 header: chef + wordmark, an optional compact search, My Recipes, Log in
 * and a menu with the page links and the Appearance switch. "Skip to recipes"
 * is the first element inside the nav, visible only when focused.
 */
export function SiteHeaderV2({
  view,
  onViewChange,
  savedCount,
  userEmail,
  onLogIn,
  account,
  links,
  search,
  skipTo = 'recipes',
}: Props) {
  const saved = view === 'saved';

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <nav aria-label="Main" className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 md:gap-5">
        <a
          href={`#${skipTo}`}
          className="sr-only rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-on-brand focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50"
        >
          Skip to recipes
        </a>
        <Link
          href="/"
          aria-label="ForkChop home"
          onClick={(e) => {
            if (view !== 'discover') {
              e.preventDefault();
              onViewChange('discover');
            }
          }}
          className="shrink-0 rounded-xl"
        >
          <ForkChopWordmark size={40} />
        </Link>

        {search && <div className="hidden min-w-0 flex-1 md:block">{search}</div>}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            aria-pressed={saved}
            onClick={() => onViewChange(saved ? 'discover' : 'saved')}
            className={cn(
              'inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-sm font-semibold',
              saved ? 'bg-brand-soft text-brand-strong' : 'text-foreground hover:bg-raised',
            )}
          >
            <Heart aria-hidden="true" size={18} fill={saved ? 'currentColor' : 'none'} />
            <span className="hidden sm:inline">My Recipes</span>
            <span className="sr-only sm:hidden">My Recipes</span>
            {savedCount > 0 && (
              <span className="rounded-full bg-raised px-1.5 font-mono text-xs tabular-nums text-foreground">
                {savedCount}
              </span>
            )}
          </button>

          {userEmail
            ? account
            : (
              <button
                type="button"
                onClick={onLogIn}
                className="inline-flex min-h-11 items-center whitespace-nowrap rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-strong"
              >
                Log in
              </button>
            )}

          <HeaderMenu links={links} />
        </div>
      </nav>
    </header>
  );
}

function HeaderMenu({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, panel, trigger);
  const { theme, setTheme } = useTheme();

  return (
    <div className="relative">
      <button
        ref={trigger}
        type="button"
        aria-label="Menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface text-foreground"
      >
        <Menu aria-hidden="true" size={20} />
      </button>
      <div
        ref={panel}
        id={id}
        hidden={!open}
        className="absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border border-border bg-surface p-2 shadow-lg"
      >
        <ul className="flex flex-col">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                onClick={close}
                className="flex min-h-14 flex-col justify-center rounded-xl px-3 hover:bg-raised"
              >
                <span className="text-[15px] font-semibold text-foreground">{link.label}</span>
                {link.blurb && <span className="text-xs text-muted">{link.blurb}</span>}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-2 border-t border-border px-1 pb-1 pt-3">
          <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted">Appearance</p>
          <SegmentedControl
            label="Appearance"
            options={THEME_PREFERENCES.map((value) => ({ value, label: THEME_LABELS[value] }))}
            value={theme}
            onChange={setTheme}
          />
        </div>
      </div>
    </div>
  );
}
