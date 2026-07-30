/**
 * A speech-to-text backend that can dictate ingredients.
 *
 * Deliberately narrower than the full Web Speech surface: only what the
 * ingredient-entry UI actually calls. Doing this means a paid provider
 * (Whisper, Deepgram, AssemblyAI) can be dropped in later as one more file
 * without touching the component.
 */

export type SpeechEventType = 'partial' | 'final' | 'error' | 'end';

export interface SpeechPartial {
  type: 'partial';
  transcript: string;
}

export interface SpeechFinal {
  type: 'final';
  transcript: string;
}

export interface SpeechErrorEvent {
  type: 'error';
  kind: 'permission-denied' | 'no-speech' | 'audio-capture' | 'network' | 'aborted' | 'other';
  message: string;
}

export interface SpeechEndEvent {
  type: 'end';
}

export type SpeechEvent = SpeechPartial | SpeechFinal | SpeechErrorEvent | SpeechEndEvent;

/**
 * A live dictation session. Callers get an unsubscribe from `on` and call
 * `stop` when the user is done.
 */
export interface SpeechSession {
  stop(): void;
  on(listener: (event: SpeechEvent) => void): () => void;
}

export interface SpeechProvider {
  id: string;
  name: string;
  /** False when the browser lacks the API or credentials are missing. */
  supported: boolean;
  /** What the operator or user needs to do; surfaced to the UI. */
  setupHint?: string;
  /** Start a session. Rejects synchronously-ish only for programming errors. */
  start(options: SpeechStartOptions): SpeechSession;
}

export interface SpeechStartOptions {
  /** BCP-47 tag. Defaults to the user's browser locale. */
  language?: string;
}
