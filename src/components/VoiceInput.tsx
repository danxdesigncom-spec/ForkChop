'use client';

import { useEffect, useRef, useState } from 'react';
import { useClientCapability } from '@/lib/use-client-capability';

/**
 * Dictate pantry items. Uses the Web Speech API, which is available in Chrome,
 * Edge and Safari but not Firefox — the button hides itself where it is not
 * supported rather than failing on click.
 *
 * Speech goes to the browser's own recognition service; on Chrome that means
 * Google's servers. That is the browser's behaviour, not something ForkChop
 * routes, but the UI says so before the microphone opens.
 */

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
  isFinal: boolean;
  length: number;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * "onions, garlic and two chicken breasts" -> three separate pantry entries.
 * Splitting is generous because the ingredient normalizer tolerates the rest.
 */
export function splitSpokenItems(transcript: string): string[] {
  return transcript
    .split(/,|\band\b|\bplus\b|\balso\b|\bthen\b/i)
    .map((part) => part.trim().replace(/^(and|some|a|an|the)\s+/i, '').trim())
    .filter((part) => part.length > 1);
}

export function VoiceInput({ onAdd }: { onAdd: (value: string) => void }) {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const supported = useClientCapability(() => getRecognitionCtor() !== null);

  useEffect(() => {
    return () => recognitionRef.current?.abort();
  }, []);

  const stop = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const start = () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;

    setError(null);
    setHeard('');

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) {
          for (const item of splitSpokenItems(text)) onAdd(item);
        } else {
          interim += text;
        }
      }
      setHeard(interim);
    };

    recognition.onerror = (event) => {
      setError(
        event.error === 'not-allowed'
          ? 'Microphone access was blocked. Allow it in your browser settings to dictate.'
          : event.error === 'no-speech'
            ? "Didn't catch that — try again."
            : `Voice input failed (${event.error}).`,
      );
      setListening(false);
    };

    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setError('Could not start voice input.');
    }
  };

  if (!supported) return null;

  return (
    <div>
      <button
        type="button"
        onClick={listening ? stop : start}
        aria-pressed={listening}
        className={`inline-flex w-full items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-2 text-sm font-semibold transition-colors
          ${
            listening
              ? 'border-transparent text-white'
              : 'border-border bg-surface hover:border-brand hover:text-brand'
          }`}
        style={listening ? { backgroundColor: 'var(--score-low)' } : undefined}
      >
        <span aria-hidden>{listening ? '⏹' : '🎤'}</span>
        {listening ? 'Stop listening' : 'Speak'}
      </button>

      {listening && (
        <p aria-live="polite" className="mt-1.5 text-xs text-muted">
          {heard ? `“${heard}”` : 'Listening… say your ingredients, separated by "and".'}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-1.5 text-xs text-score-low">
          {error}
        </p>
      )}
    </div>
  );
}
