'use client';

import { useSyncExternalStore } from 'react';

/** The capability never changes for the life of the page, so nothing to subscribe to. */
const noopSubscribe = () => () => {};
const notOnServer = () => false;

/**
 * Read a browser capability (SpeechRecognition, BarcodeDetector, …) without a
 * hydration mismatch.
 *
 * The server has no `window`, so it must render as unsupported; checking during
 * render would disagree with that, and checking in an effect means a setState
 * in the effect body. `useSyncExternalStore` is the sanctioned way to say "the
 * server sees false, the client sees the truth", and React swaps it in right
 * after hydration.
 */
export function useClientCapability(check: () => boolean): boolean {
  return useSyncExternalStore(noopSubscribe, check, notOnServer);
}
