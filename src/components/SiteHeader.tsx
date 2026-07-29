'use client';

import { PigMascot } from './PigMascot';
import { SignInPanel } from './SignInPanel';
import { AccountMenu } from './AccountMenu';

export type View = 'discover' | 'saved';

interface Props {
  view: View;
  onViewChange: (view: View) => void;
  savedCount: number;
  /** Email of the signed-in user, or null when signed out. */
  userEmail: string | null;
  /** False when this deployment has no Supabase project connected. */
  authConfigured: boolean;
  authSetupHint: string;
  /** Opened automatically when a gated action needs a signed-in user. */
  signInOpen: boolean;
  onSignInOpenChange: (open: boolean) => void;
}

export function SiteHeader({
  view,
  onViewChange,
  savedCount,
  userEmail,
  authConfigured,
  authSetupHint,
  signInOpen,
  onSignInOpenChange,
}: Props) {

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

            {userEmail ? (
              <AccountMenu email={userEmail} />
            ) : (
              <button
                type="button"
                onClick={() => onSignInOpenChange(true)}
                className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-strong"
              >
                Log in
              </button>
            )}
          </nav>
        </div>
      </header>

      {signInOpen && (
        <SignInPanel
          configured={authConfigured}
          setupHint={authSetupHint}
          onClose={() => onSignInOpenChange(false)}
        />
      )}
    </>
  );
}
