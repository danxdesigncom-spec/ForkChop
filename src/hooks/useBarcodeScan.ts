'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ResolvedIngredient } from '@/lib/types';
import { useClientCapability } from '@/lib/use-client-capability';
import {
  createDetector,
  hasCameraSupport,
  isValidBarcode,
  plannedBackend,
  type BarcodeDetectorHandle,
  type DetectorBackend,
} from '@/lib/barcode/detector';

/**
 * Camera, detection and lookup for barcode scanning, without any UI.
 *
 * Lifted out of BarcodeScanner so the v1 modal and the v2B shells
 * (docs/redesign/07-ingredient-bar-b.md §4) share exactly one implementation:
 * native BarcodeDetector with a ZXing fallback, a 300ms poll, and the lookup
 * in /api/barcode (server-side, because Open Food Facts needs a User-Agent
 * browsers can't set).
 *
 * The camera runs while `active` is true and no result is showing. A lookup
 * stops it; `scanAgain()` clears the result and starts it again. Every path
 * that ends the session stops the camera tracks.
 */

export interface LookupResult {
  code: string;
  found: boolean;
  product: {
    name: string | null;
    brand: string | null;
    quantity: string | null;
    imageUrl: string | null;
  } | null;
  ingredient: ResolvedIngredient | null;
  resolvedFrom: string | null;
}

/**
 * Why the camera is not running. Each maps to different advice: "blocked"
 * needs a settings change, "unsupported" does not.
 */
export type CameraState =
  | { kind: 'starting' }
  | { kind: 'running'; backend: DetectorBackend }
  | { kind: 'loading-decoder' }
  | { kind: 'blocked' }
  | { kind: 'no-camera' }
  | { kind: 'unsupported' }
  | { kind: 'failed'; message: string };

/** Torch support is a per-track capability that TypeScript's DOM types don't list yet. */
type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };

export function useBarcodeScan({ active = true }: { active?: boolean } = {}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorHandle | null>(null);
  const timerRef = useRef<number | null>(null);
  const busyRef = useRef(false);

  const cameraAvailable = useClientCapability(hasCameraSupport);

  const [camera, setCamera] = useState<CameraState>({ kind: 'starting' });
  const [status, setStatus] = useState<'idle' | 'looking-up'>('idle');
  const [result, setResult] = useState<LookupResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  /** Bumped by scanAgain() to restart the camera effect. */
  const [session, setSession] = useState(0);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const stopCamera = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    detectorRef.current?.dispose();
    detectorRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setTorchAvailable(false);
    setTorchOn(false);
  }, []);

  const lookup = useCallback(
    async (code: string) => {
      stopCamera();
      setStatus('looking-up');
      setLookupError(null);
      setResult(null);
      try {
        const response = await fetch(`/api/barcode?code=${encodeURIComponent(code)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Lookup failed');
        setResult(data as LookupResult);
      } catch (error) {
        setLookupError(error instanceof Error ? error.message : 'Lookup failed');
      } finally {
        setStatus('idle');
      }
    },
    [stopCamera],
  );

  const running = active && result === null && status === 'idle' && lookupError === null;

  useEffect(() => {
    // Nothing to start. The unsupported state is derived below rather than
    // set here, so the effect never has to setState synchronously.
    if (!cameraAvailable || !running) return;

    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const track = stream.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() ?? {}) as TorchCapabilities;
        setTorchAvailable(caps.torch === true);

        // Fetching ZXing can take a moment on a phone connection; say so rather
        // than showing a frozen "starting camera".
        if (plannedBackend() === 'zxing') setCamera({ kind: 'loading-decoder' });

        const detector = await createDetector();
        if (cancelled) {
          detector.dispose();
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        detectorRef.current = detector;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCamera({ kind: 'running', backend: detector.backend });

        timerRef.current = window.setInterval(async () => {
          const video = videoRef.current;
          if (!video || video.readyState < 2 || busyRef.current) return;

          // ZXing decoding is far slower than a poll tick; without this guard
          // frames pile up and the UI stutters.
          busyRef.current = true;
          try {
            const code = await detectorRef.current?.detect(video);
            if (code && isValidBarcode(code)) void lookup(code);
          } catch {
            // A single bad frame is not worth surfacing.
          } finally {
            busyRef.current = false;
          }
        }, 300);
      } catch (error) {
        if (cancelled) return;
        const name = error instanceof DOMException ? error.name : '';
        setCamera(
          name === 'NotAllowedError' || name === 'SecurityError'
            ? { kind: 'blocked' }
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? { kind: 'no-camera' }
              : { kind: 'failed', message: 'Could not start the camera.' },
        );
      }
    })();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [cameraAvailable, running, session, lookup, stopCamera]);

  /** Clear the last result or error and start the camera again. */
  const scanAgain = useCallback(() => {
    setResult(null);
    setLookupError(null);
    setCamera({ kind: 'starting' });
    setSession((n) => n + 1);
  }, []);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchAvailable(false);
    }
  }, [torchOn]);

  /**
   * A browser with no camera API can never leave 'unsupported', so it is
   * derived from the capability rather than stored.
   */
  const cameraState: CameraState = cameraAvailable ? camera : { kind: 'unsupported' };

  return {
    videoRef,
    camera: cameraState,
    status,
    result,
    lookupError,
    lookup,
    scanAgain,
    stopCamera,
    torch: { available: torchAvailable, on: torchOn, toggle: toggleTorch },
  };
}

export { isValidBarcode };
