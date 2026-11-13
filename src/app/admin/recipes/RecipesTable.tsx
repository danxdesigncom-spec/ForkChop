'use client';

import { useState, useTransition } from 'react';
import { toggleRecipeDisabled, type ActionResult } from './actions';

export interface AdminRecipeRow {
  slug: string;
  title: string;
  emoji: string;
  cuisine: string;
  sourceId: string;
  disabled: boolean;
}

export function RecipesTable({ rows }: { rows: AdminRecipeRow[] }) {
  const [feedback, setFeedback] = useState<ActionResult | null>(null);
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  // Optimistic — the server action doesn't persist yet, so we track it here so
  // the button visibly toggles during a session. Refresh will reset it.
  const [localDisabled, setLocalDisabled] = useState<Set<string>>(() => new Set());
  const [, startTransition] = useTransition();

  const toggle = (row: AdminRecipeRow) => {
    const currentlyDisabled = localDisabled.has(row.slug) || row.disabled;
    setPendingSlug(row.slug);
    setFeedback(null);
    startTransition(async () => {
      const result = await toggleRecipeDisabled(row.slug, !currentlyDisabled);
      if (result.ok) {
        setLocalDisabled((prev) => {
          const next = new Set(prev);
          if (currentlyDisabled) next.delete(row.slug);
          else next.add(row.slug);
          return next;
        });
      }
      setFeedback(result);
      setPendingSlug(null);
    });
  };

  return (
    <div className="space-y-3">
      {feedback && (
        <p
          className={`rounded-md px-3 py-2 text-xs ${
            feedback.ok
              ? 'bg-score-high-soft text-score-high'
              : 'bg-score-mid-soft text-score-mid'
          }`}
        >
          {feedback.message}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-2 pr-3 font-medium">Recipe</th>
              <th className="py-2 pr-3 font-medium">Cuisine</th>
              <th className="py-2 pr-3 font-medium">Source</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const busy = pendingSlug === row.slug;
              const disabled = localDisabled.has(row.slug) || row.disabled;
              return (
                <tr key={row.slug} className="border-t border-border align-middle">
                  <td className="py-2 pr-3">
                    <span aria-hidden className="mr-2">
                      {row.emoji}
                    </span>
                    <span className="font-medium">{row.title}</span>
                    <span className="ml-2 text-xs text-muted">{row.slug}</span>
                  </td>
                  <td className="py-2 pr-3 text-muted">{row.cuisine || '—'}</td>
                  <td className="py-2 pr-3 text-muted">{row.sourceId}</td>
                  <td className="py-2 pr-3">
                    {disabled ? (
                      <span className="rounded-full bg-score-mid-soft px-2 py-0.5 text-xs text-score-mid">
                        Disabled
                      </span>
                    ) : (
                      <span className="rounded-full bg-score-high-soft px-2 py-0.5 text-xs text-score-high">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => toggle(row)}
                      className={`rounded-md border px-2 py-1 text-xs disabled:opacity-50 ${
                        disabled
                          ? 'border-border hover:bg-surface-muted'
                          : 'border-score-mid text-score-mid hover:bg-score-mid-soft'
                      }`}
                    >
                      {busy ? '…' : disabled ? 'Enable' : 'Disable'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
