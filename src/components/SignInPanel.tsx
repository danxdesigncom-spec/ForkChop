'use client';

import { useActionState, useEffect, useRef } from 'react';
import { signInWithEmail, type AuthResult } from '@/app/auth/actions';
import { PigMascot } from './PigMascot';

/**
 * Passwordless sign-in.
 *
 * The method row below holds a single option today. It exists so phone/SMS can
 * be added later without redesigning the panel — SMS needs a paid provider, so
 * it is deliberately out of scope for now.
 */
const METHODS = [
  { id: 'email', label: 'Email', emoji: '✉️', available: true },
  { id: 'phone', label: 'Phone', emoji: '📱', available: false },
] as const;

export function SignInPanel({
  configured,
  setupHint,
  onClose,
}: {
  configured: boolean;
  setupHint: string;
  onClose: () => void;
}) {
  const [result, formAction, pending] = useActionState<AuthResult | null, FormData>(
    signInWithEmail,
    null,
  );
  const closeRef = useRef<HTMLButtonElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const sent = result?.ok === true;

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
        aria-labelledby="signin-title"
        className="w-full max-w-md rounded-t-2xl border border-border bg-surface p-6 sm:rounded-2xl"
      >
        <div className="flex items-start gap-3">
          <PigMascot size={56} mood={sent ? 'happy' : 'hungry'} />
          <div className="min-w-0 flex-1">
            <h2 id="signin-title" className="text-lg font-bold">
              {sent ? 'Check your inbox' : 'Sign in to ForkChop'}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {sent
                ? 'Click the link in the email and you’ll be signed in.'
                : 'No password needed — we’ll email you a link.'}
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

        {!configured && (
          <div className="mt-4 rounded-xl border border-border bg-surface-muted p-4 text-sm">
            <p className="font-semibold">Accounts aren&apos;t configured yet</p>
            <p className="mt-1 text-muted">
              This deployment has no Supabase project connected, so sign-in is unavailable. Your
              pantry and saved recipes stay in this browser.
            </p>
            <p className="mt-2 rounded-lg bg-surface p-2 font-mono text-xs text-muted">{setupHint}</p>
          </div>
        )}

        {configured && !sent && (
          <>
            <div className="mt-4 flex gap-2" role="group" aria-label="Sign-in method">
              {METHODS.map((method) => (
                <button
                  key={method.id}
                  type="button"
                  disabled={!method.available}
                  aria-pressed={method.available}
                  title={method.available ? undefined : 'Coming later'}
                  className={`flex-1 rounded-xl border-2 px-3 py-2 text-sm font-semibold transition-colors
                    ${
                      method.available
                        ? 'border-brand bg-brand-soft text-brand-strong'
                        : 'cursor-not-allowed border-border text-muted opacity-60'
                    }`}
                >
                  <span aria-hidden>{method.emoji}</span> {method.label}
                  {!method.available && <span className="block text-[10px] font-normal">Later</span>}
                </button>
              ))}
            </div>

            <form action={formAction} className="mt-4">
              <label htmlFor="signin-email" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted">
                Email address
              </label>
              <input
                ref={emailRef}
                id="signin-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                placeholder="you@example.com"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm
                           placeholder:text-muted focus:border-brand focus:outline-none"
              />

              {result && !result.ok && (
                <p role="alert" className="mt-2 text-sm text-score-low">
                  {result.message}
                </p>
              )}

              <button
                type="submit"
                disabled={pending}
                className="mt-3 w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white
                           hover:bg-brand-strong disabled:opacity-60"
              >
                {pending ? 'Sending…' : 'Email me a link'}
              </button>
            </form>

            <p className="mt-3 text-xs text-muted">
              Signing in keeps your saved recipes across devices. Anything you&apos;ve already saved
              in this browser comes with you.
            </p>
          </>
        )}

        {sent && (
          <>
            <p className="mt-4 rounded-xl border border-border bg-surface-muted p-4 text-sm">
              {result?.message}
            </p>
            <p className="mt-3 text-xs text-muted">
              Nothing arrived? Check your spam folder, then close this and try again in a minute.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-strong"
            >
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}
