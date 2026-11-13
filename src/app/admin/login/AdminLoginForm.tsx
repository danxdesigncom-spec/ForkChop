'use client';

import { useActionState } from 'react';
import { signInWithEmail, type AuthResult } from '@/app/auth/actions';

/**
 * Reuses the app's magic-link server action verbatim. The allowlist check
 * happens on subsequent /admin page loads once the user comes back with a
 * session — no admin-specific auth path to keep in sync.
 */
export function AdminLoginForm() {
  const [result, formAction, pending] = useActionState<AuthResult | null, FormData>(
    signInWithEmail,
    null,
  );

  const sent = result?.ok === true;

  return (
    <form action={formAction} className="space-y-3">
      <label className="block text-sm">
        <span className="text-muted">Email</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="mt-1 w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm focus:border-brand focus:outline-none"
          placeholder="you@example.com"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-50"
      >
        {pending ? 'Sending…' : 'Send sign-in link'}
      </button>

      {result && (
        <p
          className={`text-xs ${
            sent ? 'text-score-high' : 'text-score-mid'
          }`}
        >
          {result.message}
        </p>
      )}
    </form>
  );
}
