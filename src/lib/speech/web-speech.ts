'use client';

import type {
  SpeechEvent,
  SpeechProvider,
  SpeechSession,
  SpeechStartOptions,
} from './types';

/**
 * Web Speech API wrapper.
 *
 * Free, in-browser, no key. The actual recognition service that runs is
 * chosen by the browser — on Chrome that means Google's servers. That is
 * browser behaviour rather than something this app routes, but the UI still
 * says so before opening the mic.
 *
 * Supported: Chrome, Edge, Safari (webkit prefix). Not Firefox.
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

export function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Turn the API's error strings into the provider's typed error kinds. */
function classifyError(raw: string): { kind: 'permission-denied' | 'no-speech' | 'audio-capture' | 'network' | 'aborted' | 'other'; message: string } {
  switch (raw) {
    case 'not-allowed':
    case 'service-not-allowed':
      return {
        kind: 'permission-denied',
        message: 'Microphone access was blocked. Allow it in your browser settings to dictate.',
      };
    case 'no-speech':
      return { kind: 'no-speech', message: 'Didn’t catch that — try again.' };
    case 'audio-capture':
      return { kind: 'audio-capture', message: 'No microphone was found on this device.' };
    case 'network':
      return { kind: 'network', message: 'The speech service was unreachable.' };
    case 'aborted':
      return { kind: 'aborted', message: 'Voice input was cancelled.' };
    default:
      return { kind: 'other', message: `Voice input failed (${raw}).` };
  }
}

function startSession(Ctor: SpeechRecognitionCtor, options: SpeechStartOptions): SpeechSession {
  const listeners = new Set<(event: SpeechEvent) => void>();
  const emit = (event: SpeechEvent) => {
    for (const listener of listeners) listener(event);
  };

  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = options.language ?? (typeof navigator !== 'undefined' ? navigator.language : 'en-US');

  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result[0].transcript;
      if (result.isFinal) {
        emit({ type: 'final', transcript: text });
      } else {
        interim += text;
      }
    }
    if (interim) emit({ type: 'partial', transcript: interim });
  };

  recognition.onerror = (event) => {
    const { kind, message } = classifyError(event.error);
    emit({ type: 'error', kind, message });
  };

  recognition.onend = () => emit({ type: 'end' });

  // `start()` can throw synchronously if called twice. Surfacing that through
  // the same event channel keeps callers uniform.
  try {
    recognition.start();
  } catch (error) {
    queueMicrotask(() =>
      emit({
        type: 'error',
        kind: 'other',
        message: error instanceof Error ? error.message : 'Could not start voice input.',
      }),
    );
    queueMicrotask(() => emit({ type: 'end' }));
  }

  return {
    stop() {
      try {
        recognition.stop();
      } catch {
        // Already stopped — fine.
      }
    },
    on(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const webSpeechProvider: SpeechProvider = {
  id: 'web-speech',
  name: 'Browser speech recognition',
  get supported() {
    return getRecognitionCtor() !== null;
  },
  setupHint: 'This browser has no built-in speech recognition.',
  start(options) {
    const Ctor = getRecognitionCtor();
    if (!Ctor) throw new Error('Web Speech API not available.');
    return startSession(Ctor, options);
  },
};
