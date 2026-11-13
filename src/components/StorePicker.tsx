'use client';

import { useState } from 'react';
import type { ChosenStore } from '@/lib/store-preference';

interface StoreResult {
  locationId: string;
  name: string;
  banner: string;
  address: string;
}

/**
 * Choose which store to price against.
 *
 * Prices are per-store — the same gallon of milk was $6.99 at one banner and
 * $3.49 at another when this was built — so a basket priced against the wrong
 * store is worse than no prices at all. Search is by ZIP because that is what
 * a shopper knows without looking anything up.
 */
export function StorePicker({
  chosen,
  onChoose,
}: {
  chosen: ChosenStore | null;
  onChoose: (store: ChosenStore | null) => void;
}) {
  const [zip, setZip] = useState('');
  const [results, setResults] = useState<StoreResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch(`/api/kroger/stores?zip=${encodeURIComponent(zip.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not look up stores.');
      const stores = (data.stores ?? []) as StoreResult[];
      if (stores.length === 0) {
        setError('No stores found near that ZIP code.');
      }
      setResults(stores);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  if (chosen) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-muted p-3 text-xs">
        <span aria-hidden className="text-sm">
          📍
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{chosen.name || chosen.banner}</p>
          {chosen.address && <p className="text-muted">{chosen.address}</p>}
        </div>
        <button
          type="button"
          onClick={() => {
            onChoose(null);
            setResults(null);
            setZip('');
          }}
          className="shrink-0 font-medium text-brand hover:underline"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface-muted p-3">
      <p className="text-xs font-semibold">Pick your store for prices</p>
      <p className="mt-0.5 text-xs text-muted">
        Prices vary a lot between stores, so we ask rather than guess.
      </p>

      <div className="mt-2 flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          value={zip}
          onChange={(e) => setZip(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (zip.trim().length === 5) void search();
            }
          }}
          placeholder="ZIP code"
          aria-label="ZIP code"
          maxLength={5}
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void search()}
          disabled={loading || zip.trim().length !== 5}
          className="shrink-0 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-50"
        >
          {loading ? 'Finding…' : 'Find'}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs text-score-mid">
          {error}
        </p>
      )}

      {results && results.length > 0 && (
        <ul className="mt-2 max-h-56 overflow-y-auto brand-scrollbar">
          {results.map((store) => (
            <li key={store.locationId}>
              <button
                type="button"
                onClick={() =>
                  onChoose({
                    locationId: store.locationId,
                    name: store.name,
                    banner: store.banner,
                    address: store.address,
                  })
                }
                className="flex min-h-[52px] w-full flex-col items-start gap-0.5 rounded-lg px-2 py-2 text-left hover:bg-brand-soft"
              >
                <span className="text-xs font-semibold">{store.name || store.banner}</span>
                <span className="text-xs text-muted">{store.address}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
