import type { SpeechProvider } from './types';

/**
 * Placeholder for a paid hosted speech-to-text (Whisper, Deepgram, ...).
 *
 * Not implemented — this file exists so a later phase can drop in the real
 * thing without touching the UI. The provider is deliberately `supported:
 * false` and calling `start()` throws, matching how the grocery providers
 * behave when unconfigured.
 *
 * When wiring one up:
 *   1. Add its API key to a SERVER-ONLY env var (no NEXT_PUBLIC_ prefix)
 *   2. Add a proxy route: /api/speech/token or /api/speech/stream
 *   3. Implement start() to open a WebSocket or MediaRecorder pipeline
 *   4. Register it in ./index.ts, preferred when supported
 * The UI needs no changes.
 */

export const hostedSpeechProvider: SpeechProvider = {
  id: 'hosted',
  name: 'Hosted speech recognition',
  supported: false,
  setupHint:
    'A hosted speech provider (Whisper, Deepgram) is not wired up in this build.',
  start() {
    throw new Error('Hosted speech provider is not configured.');
  },
};
