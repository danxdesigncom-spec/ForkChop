import type { SpeechProvider } from './types';
import { webSpeechProvider } from './web-speech';
import { hostedSpeechProvider } from './hosted';

export * from './types';
export { splitSpokenItems } from './parse';

/**
 * Providers, in preference order.
 *
 * A hosted service, once wired up, would be more accurate than the browser's
 * — so if both are available we pick that. Today only the free one is
 * supported, so this is effectively a single-element choice, but the shape
 * is what lets Phase N add a paid provider without a rewrite.
 */
const PROVIDERS: SpeechProvider[] = [hostedSpeechProvider, webSpeechProvider];

export function getSpeechProvider(): SpeechProvider | null {
  return PROVIDERS.find((p) => p.supported) ?? null;
}

/** All providers, for debugging and the setup-hint copy in the UI. */
export function listSpeechProviders(): SpeechProvider[] {
  return [...PROVIDERS];
}
