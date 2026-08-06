'use client';

import { useActionState } from 'react';
import { fetchFromSpoonacular, type ActionResult } from './actions';

export function SpoonacularFetchForm() {
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(
    fetchFromSpoonacular,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <label className="block text-sm">
        <span className="text-muted">Search term</span>
        <input
          type="text"
          name="query"
          required
          placeholder="e.g. mushroom risotto"
          className="mt-1 w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-50"
      >
        {pending ? 'Fetching…' : 'Fetch from Spoonacular'}
      </button>
      {result && (
        <p
          className={`text-xs ${
            result.ok ? 'text-score-high' : 'text-score-mid'
          }`}
        >
          {result.message}
        </p>
      )}
    </form>
  );
}
