'use client';

import { useState, useTransition } from 'react';
import { disableUser, enableUser, sendSignInLink, type ActionResult } from './actions';

export interface AdminUserRow {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  disabled: boolean;
}

export function UsersTable({ rows }: { rows: AdminUserRow[] }) {
  const [feedback, setFeedback] = useState<ActionResult | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const run = (id: string, work: () => Promise<ActionResult>) => {
    setPendingId(id);
    setFeedback(null);
    startTransition(async () => {
      const result = await work();
      setFeedback(result);
      setPendingId(null);
    });
  };

  if (rows.length === 0) {
    return <p className="text-sm text-muted">No users yet.</p>;
  }

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
              <th className="py-2 pr-3 font-medium">Email</th>
              <th className="py-2 pr-3 font-medium">Signed up</th>
              <th className="py-2 pr-3 font-medium">Last sign-in</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const busy = pendingId === row.id;
              return (
                <tr key={row.id} className="border-t border-border align-middle">
                  <td className="py-2 pr-3">{row.email}</td>
                  <td className="py-2 pr-3 text-muted">{formatDate(row.createdAt)}</td>
                  <td className="py-2 pr-3 text-muted">{formatDate(row.lastSignInAt)}</td>
                  <td className="py-2 pr-3">
                    {row.disabled ? (
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
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => run(row.id, () => sendSignInLink(row.email))}
                        className="rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-muted disabled:opacity-50"
                      >
                        {busy ? '…' : 'Send sign-in link'}
                      </button>
                      {row.disabled ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => run(row.id, () => enableUser(row.id))}
                          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-muted disabled:opacity-50"
                        >
                          {busy ? '…' : 'Enable'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => run(row.id, () => disableUser(row.id))}
                          className="rounded-md border border-score-mid px-2 py-1 text-xs text-score-mid hover:bg-score-mid-soft disabled:opacity-50"
                        >
                          {busy ? '…' : 'Disable'}
                        </button>
                      )}
                    </div>
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

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
