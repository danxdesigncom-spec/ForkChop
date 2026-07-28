'use client';

import { useEffect, useRef, useState } from 'react';
import { PigMascot } from './PigMascot';

export type View = 'discover' | 'saved';

interface Props {
  view: View;
  onViewChange: (view: View) => void;
  savedCount: number;
}

export function SiteHeader({ view, onViewChange, savedCount }: Props) {
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 border-b-4 border-brand bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => onViewChange('discover')}
            className="flex items-center gap-3 text-left"
            aria-label="ForkChop home"
          >
            <PigMascot size={44} mood="happy" />
            <span>
              <span className="block text-2xl font-extrabold leading-none tracking-tight">
                Fork<span className="text-brand">Chop</span>
              </span>
              <span className="mt-1 block text-xs font-medium text-muted">
                Cook what you already have
              </span>
            </span>
          </button>

          <nav className="ml-auto flex items-center gap-2" aria-label="Main">
            <button
              type="button"
              onClick={() => onViewChange(view === 'saved' ? 'discover' : 'saved')}
              aria-pressed={view === 'saved'}
              className={`inline-flex items-center gap-1.5 rounded-xl border-2 px-3 py-2 text-sm font-semibold transition-colors
                ${
                  view === 'saved'
                    ? 'border-brand bg-brand text-white'
                    : 'border-border bg-surface hover:border-brand hover:text-brand'
                }`}
            >
              <span aria-hidden>{view === 'saved' ? '❤️' : '🤍'}</span>
              My Recipes
              {savedCount > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-xs font-bold tabular-nums ${
                    view === 'saved' ? 'bg-white/25' : 'bg-brand-soft text-brand-strong'
                  }`}
                >
                  {savedCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setLoginOpen(true)}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-strong"
            >
              Log in
            </button>
          </nav>
        </div>
      </header>

      {loginOpen && <LoginPanel onClose={() => setLoginOpen(false)} />}
    </>
  );
}

/**
 * There is no auth backend yet, so this deliberately does not present a
 * username and password form. Collecting credentials with nowhere to send them
 * teaches users to type passwords into anything that asks — the honest thing is
 * to say what does and does not exist, and where their data currently lives.
 */
function LoginPanel({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
        className="w-full max-w-md rounded-t-2xl border border-border bg-surface p-6 sm:rounded-2xl"
      >
        <div className="flex items-start gap-3">
          <PigMascot size={56} mood="hungry" />
          <div className="min-w-0 flex-1">
            <h2 id="login-title" className="text-lg font-bold">
              Accounts aren&apos;t connected yet
            </h2>
            <p className="mt-1 text-sm text-muted">
              ForkChop has no sign-in backend in this build, so there is nothing to log in to.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg px-2 py-1 text-muted hover:bg-surface-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-border bg-surface-muted p-4 text-sm">
          <p className="font-semibold">Where your data lives right now</p>
          <ul className="mt-2 space-y-1.5 text-muted">
            <li>· Your pantry, allergies, dislikes and saved recipes stay in this browser.</li>
            <li>· Nothing is sent anywhere, and nothing is shared between devices.</li>
            <li>· Clearing site data clears all of it.</li>
          </ul>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-strong"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
