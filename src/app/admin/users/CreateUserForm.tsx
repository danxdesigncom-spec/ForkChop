'use client';

import { useActionState } from 'react';
import { createUser, type ActionResult } from './actions';

export function CreateUserForm() {
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(
    createUser,
    null,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <label className="flex-1 min-w-[220px] text-sm">
        <span className="text-muted">Email</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="off"
          placeholder="new-user@example.com"
          className="mt-1 w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-50"
      >
        {pending ? 'Inviting…' : 'Invite user'}
      </button>
      {result && (
        <p
          className={`w-full text-xs ${
            result.ok ? 'text-score-high' : 'text-score-mid'
          }`}
        >
          {result.message}
        </p>
      )}
    </form>
  );
}
