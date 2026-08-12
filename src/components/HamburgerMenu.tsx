'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { NavLink } from '@/lib/nav-links';

/**
 * Header menu. One design across desktop and mobile — a large hamburger
 * button that opens an anchored panel below the header.
 *
 * Tap-target discipline:
 *   - The button is 44×44 (Apple HIG minimum) with a large hit area and its
 *     own visual container, separated from siblings by ml-2.
 *   - Panel opens BELOW the header, with a 4px gap, so touching a link never
 *     lands on a header button beneath it.
 *   - Each link row is 56px tall so fingers land cleanly.
 *   - A backdrop absorbs taps outside the panel so nothing behind it
 *     activates by accident.
 *
 * Dismissal: Escape, backdrop click, or picking a link. Focus returns to the
 * button when the panel closes so keyboard users don't lose their place.
 */
export function HamburgerMenu({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const close = useCallback(() => {
    setOpen(false);
    // Return focus so keyboard users don't get dumped at the top of the page.
    buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', onKey);

    // Move focus into the panel so screen readers announce it.
    const firstLink = panelRef.current?.querySelector<HTMLElement>('a, button');
    firstLink?.focus();

    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? 'Close menu' : 'Open menu'}
        className="ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-xl border-2 border-border bg-surface text-brand-strong transition-colors hover:border-brand hover:bg-brand-soft focus-visible:border-brand"
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M4 7h16M4 12h16M4 17h16"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        )}
      </button>

      {open && (
        <>
          {/*
            Backdrop swallows every tap outside the panel, so nothing under
            it fires by accident. Positioned starting under the header
            (top-16) so the header stays interactive — you can still tap the
            hamburger itself to close.
           */}
          <button
            type="button"
            aria-label="Close menu"
            onClick={close}
            className="fixed inset-x-0 top-16 bottom-0 z-40 bg-black/30 backdrop-blur-sm sm:top-20"
          />

          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-label="Site menu"
            className="absolute right-4 top-full z-50 mt-1 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border-2 border-brand bg-surface shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-xs font-bold uppercase tracking-wide text-muted">Menu</span>
              <button
                type="button"
                onClick={close}
                aria-label="Close menu"
                className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-surface-muted hover:text-brand"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            <ul className="py-1">
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={close}
                    className="flex min-h-[56px] items-start gap-3 px-4 py-3 text-sm transition-colors hover:bg-brand-soft focus-visible:bg-brand-soft"
                  >
                    <span aria-hidden className="mt-0.5 text-lg leading-none">
                      {link.emoji}
                    </span>
                    <span className="flex-1">
                      <span className="block font-semibold">{link.label}</span>
                      {link.blurb && (
                        <span className="mt-0.5 block text-xs text-muted">{link.blurb}</span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </>
  );
}
