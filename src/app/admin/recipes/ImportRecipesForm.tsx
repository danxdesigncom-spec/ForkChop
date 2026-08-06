'use client';

import { useActionState } from 'react';
import { importRecipesJson, type ActionResult } from './actions';

export function ImportRecipesForm() {
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(
    importRecipesJson,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input
        type="file"
        name="file"
        accept="application/json,.json"
        required
        className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border file:border-border file:bg-surface-muted file:px-3 file:py-1.5 file:text-xs hover:file:bg-surface"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-50"
      >
        {pending ? 'Validating…' : 'Import recipes'}
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
