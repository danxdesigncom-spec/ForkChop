'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useClientCapability } from '@/lib/use-client-capability';
import { getSpeechProvider, splitSpokenItems, type SpeechSession } from '@/lib/speech';

/**
 * Voice ingredient entry.
 *
 * Speech recognition is fallible — "chilli flakes" turns into "chile flakes",
 * "linseed" into "lin seed" — so heard items land in a small review tray
 * rather than the pantry directly. The user drops, edits or commits them.
 * Everything else (parsing, permission handling, browser detection) is
 * delegated to src/lib/speech, so a hosted STT provider can be swapped in
 * later as one more file.
 */

interface Props {
  onAdd: (value: string) => void;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'listening' }
  | { kind: 'error'; message: string };

/**
 * Items are keyed by an incrementing id, not by their text — so a user
 * editing "chile" to "chilli" doesn't collide with anything already there,
 * and React never gets a duplicate key from a repeated utterance.
 */
interface PendingItem {
  id: number;
  text: string;
}

export function VoiceInput({ onAdd }: Props) {
  const supported = useClientCapability(() => getSpeechProvider() !== null);

  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [interim, setInterim] = useState('');
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);

  const sessionRef = useRef<SpeechSession | null>(null);
  const nextIdRef = useRef(1);
  /**
   * Reset when a session starts; flipped once anything final arrives. Lets
   * the error handler decide whether trailing silence is worth flagging,
   * without closing over pending state.
   */
  const heardAnythingRef = useRef(false);

  const addToPending = useCallback((items: string[]) => {
    if (items.length === 0) return;
    setPending((current) => {
      const seen = new Set(current.map((item) => item.text.toLowerCase()));
      const additions: PendingItem[] = [];
      for (const text of items) {
        const key = text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        additions.push({ id: nextIdRef.current++, text });
      }
      return additions.length ? [...current, ...additions] : current;
    });
  }, []);

  const stop = useCallback(() => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    // The session's own `end` event is what flips status back to idle; do not
    // duplicate it here or a fresh error message can be clobbered.
  }, []);

  useEffect(() => {
    // Session lives beyond this component's render, so stop it on unmount to
    // release the microphone rather than leaving it recording invisibly.
    return () => sessionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const provider = getSpeechProvider();
    if (!provider) return;

    setStatus({ kind: 'listening' });
    setInterim('');
    heardAnythingRef.current = false;

    const session = provider.start({});
    sessionRef.current = session;

    session.on((event) => {
      switch (event.type) {
        case 'partial':
          setInterim(event.transcript);
          break;
        case 'final':
          heardAnythingRef.current = true;
          addToPending(splitSpokenItems(event.transcript));
          setInterim('');
          break;
        case 'error':
          // 'no-speech' fires on trailing silence and is not worth surfacing
          // once the user has already dictated something usable — the tray
          // shows the outcome. The ref is set from the same session, so it
          // is safe to read here (unlike a value closed over from state).
          if (event.kind === 'no-speech' && heardAnythingRef.current) return;
          setStatus({ kind: 'error', message: event.message });
          break;
        case 'end':
          setStatus((current) => (current.kind === 'error' ? current : { kind: 'idle' }));
          break;
      }
    });
  }, [addToPending]);

  const removeItem = (id: number) =>
    setPending((current) => current.filter((item) => item.id !== id));

  const editItem = (id: number, text: string) =>
    setPending((current) =>
      current.map((item) => (item.id === id ? { ...item, text } : item)),
    );

  const commit = () => {
    for (const item of pending) {
      const trimmed = item.text.trim();
      if (trimmed) onAdd(trimmed);
    }
    setPending([]);
    setInterim('');
    setStatus({ kind: 'idle' });
  };

  const discardAll = () => {
    setPending([]);
    setInterim('');
  };

  const listening = status.kind === 'listening';

  const hint = useMemo(() => {
    if (status.kind === 'error') return null;
    if (listening) {
      return interim
        ? `“${interim}”`
        : 'Listening… say your ingredients, separated by “and”.';
    }
    if (pending.length > 0) return 'Review, then add to your kitchen.';
    return null;
  }, [status.kind, listening, interim, pending.length]);

  if (!supported) return null;

  return (
    <div>
      <button
        type="button"
        onClick={listening ? stop : start}
        aria-pressed={listening}
        aria-label={listening ? 'Stop listening' : 'Add ingredients by voice'}
        className={`inline-flex w-full items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-2 text-sm font-semibold transition-colors
          ${
            listening
              ? 'border-transparent text-white'
              : 'border-border bg-surface hover:border-brand hover:text-brand'
          }`}
        style={listening ? { backgroundColor: 'var(--score-low)' } : undefined}
      >
        <span aria-hidden className={listening ? 'animate-pulse' : ''}>
          {listening ? '⏹' : '🎤'}
        </span>
        {listening ? 'Stop listening' : 'Speak'}
      </button>

      {hint && (
        <p aria-live="polite" className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      )}

      {status.kind === 'error' && (
        <p role="alert" className="mt-1.5 text-xs text-score-low">
          {status.message}
        </p>
      )}

      {pending.length > 0 && (
        <ReviewTray
          items={pending}
          editingId={editingId}
          onStartEdit={setEditingId}
          onStopEdit={() => setEditingId(null)}
          onEdit={editItem}
          onRemove={removeItem}
          onCommit={commit}
          onDiscard={discardAll}
        />
      )}
    </div>
  );
}

/**
 * The transcript-editing surface.
 *
 * Tap a chip to edit it, ✕ to drop, or press Enter / blur to keep the change.
 * Extracted so the microphone state and the review flow are independently
 * scannable.
 */
function ReviewTray({
  items,
  editingId,
  onStartEdit,
  onStopEdit,
  onEdit,
  onRemove,
  onCommit,
  onDiscard,
}: {
  items: PendingItem[];
  editingId: number | null;
  onStartEdit: (id: number) => void;
  onStopEdit: () => void;
  onEdit: (id: number, text: string) => void;
  onRemove: (id: number) => void;
  onCommit: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="mt-2 rounded-xl border border-border bg-surface-muted p-2.5">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
        Heard {items.length === 1 ? '1 item' : `${items.length} items`} — edit or drop before adding
      </p>

      <ul className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li key={item.id}>
            {editingId === item.id ? (
              <input
                type="text"
                autoFocus
                defaultValue={item.text}
                onBlur={(event) => {
                  onEdit(item.id, event.currentTarget.value);
                  onStopEdit();
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    onEdit(item.id, event.currentTarget.value);
                    onStopEdit();
                  } else if (event.key === 'Escape') {
                    onStopEdit();
                  }
                }}
                aria-label={`Edit ${item.text}`}
                className="rounded-full border border-brand bg-surface px-3 py-1 text-xs focus:outline-none"
              />
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs">
                <button
                  type="button"
                  onClick={() => onStartEdit(item.id)}
                  className="max-w-[16ch] truncate hover:text-brand"
                  aria-label={`Edit ${item.text}`}
                  title="Tap to edit"
                >
                  {item.text}
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  aria-label={`Drop ${item.text}`}
                  className="text-muted hover:text-score-low"
                >
                  ✕
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          onClick={onCommit}
          disabled={items.length === 0}
          className="flex-1 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60"
        >
          Add {items.length} to kitchen
        </button>
        <button
          type="button"
          onClick={onDiscard}
          aria-label="Discard everything heard"
          className="rounded-xl border-2 border-border px-3 py-2 text-sm font-semibold text-muted hover:border-score-low hover:text-score-low"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
