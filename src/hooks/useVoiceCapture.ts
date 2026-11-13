'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSpeechProvider, splitSpokenItems, type SpeechSession } from '@/lib/speech';
import { foldSpokenItems, liftQuantity, type SpokenChip } from '@/lib/speech/fold';
import { useClientCapability } from '@/lib/use-client-capability';

/**
 * The v2B listening state (docs/redesign/07-ingredient-bar-b.md §5), without UI.
 *
 * Same speech provider and splitter as VoiceInput (src/lib/speech); the
 * difference is only what happens with the words. Heard items become preview
 * chips, folded by ingredient with ×N counts, and nothing reaches the pantry
 * until the caller commits them.
 *
 *   idle -> listening -> (end) -> review -> commit | cancel -> idle
 *
 * `review` is the same visual state as `listening` with the mic off, so people
 * can still press Add after a pause ends the recognition session.
 */

export type VoicePhase = 'idle' | 'listening' | 'review';

export function useVoiceCapture() {
  const supported = useClientCapability(() => getSpeechProvider() !== null);
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [interim, setInterim] = useState('');
  const [heard, setHeard] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Catalog names by spoken phrase, from /api/ingredients?resolve=. */
  const [names, setNames] = useState<Map<string, string | null>>(new Map());

  const sessionRef = useRef<SpeechSession | null>(null);
  const heardRef = useRef(0);

  const stopSession = useCallback(() => {
    sessionRef.current?.stop();
    sessionRef.current = null;
  }, []);

  // Release the microphone if the field unmounts mid-session.
  useEffect(() => () => sessionRef.current?.stop(), []);

  const start = useCallback(() => {
    const provider = getSpeechProvider();
    if (!provider) return;
    setError(null);
    setInterim('');
    setHeard([]);
    heardRef.current = 0;
    setPhase('listening');

    const session = provider.start({});
    sessionRef.current = session;
    session.on((event) => {
      switch (event.type) {
        case 'partial':
          setInterim(event.transcript);
          break;
        case 'final': {
          const items = splitSpokenItems(event.transcript);
          heardRef.current += items.length;
          setHeard((current) => [...current, ...items]);
          setInterim('');
          break;
        }
        case 'error':
          // Trailing silence after something usable is just the end of speech.
          if (event.kind === 'no-speech' && heardRef.current > 0) return;
          setError(event.message);
          break;
        case 'end':
          sessionRef.current = null;
          setInterim('');
          // Nothing heard: back to the plain field (with any error showing).
          setPhase(heardRef.current > 0 ? 'review' : 'idle');
          break;
      }
    });
  }, []);

  // Look up catalog names for phrases we haven't seen, so chips read "Onion"
  // rather than "onions". Unresolved phrases simply show as heard.
  const phrases = useMemo(() => [...new Set(heard.map((h) => liftQuantity(h).phrase))], [heard]);
  useEffect(() => {
    const missing = phrases.filter((p) => !names.has(p));
    if (missing.length === 0) return;
    const controller = new AbortController();
    const params = new URLSearchParams();
    for (const p of missing) params.append('resolve', p);
    (async () => {
      try {
        const res = await fetch(`/api/ingredients?${params.toString()}`, { signal: controller.signal });
        if (!res.ok) return;
        const data = (await res.json()) as { resolved: { raw: string; name: string | null }[] };
        setNames((current) => {
          const next = new Map(current);
          for (const r of data.resolved) next.set(r.raw, r.name);
          return next;
        });
      } catch {
        // Offline or aborted: the chips keep the words as heard.
      }
    })();
    return () => controller.abort();
  }, [phrases, names]);

  const chips: SpokenChip[] = useMemo(
    () => foldSpokenItems(heard, (phrase) => names.get(phrase) ?? null),
    [heard, names],
  );

  const reset = useCallback(() => {
    stopSession();
    setPhase('idle');
    setInterim('');
    setHeard([]);
    heardRef.current = 0;
  }, [stopSession]);

  /** Returns the chips to add and goes back to the plain field. */
  const commit = useCallback((): SpokenChip[] => {
    const out = chips;
    reset();
    return out;
  }, [chips, reset]);

  const removeChip = useCallback((name: string) => {
    setHeard((current) =>
      current.filter((h) => {
        const phrase = liftQuantity(h).phrase;
        return (names.get(phrase) ?? phrase).toLowerCase() !== name.toLowerCase();
      }),
    );
  }, [names]);

  return {
    supported,
    /** True while the field shows the listening/review state. */
    active: phase !== 'idle',
    listening: phase === 'listening',
    interim,
    chips,
    error,
    clearError: () => setError(null),
    start,
    cancel: reset,
    commit,
    removeChip,
  };
}
