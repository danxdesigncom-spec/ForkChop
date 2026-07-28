'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ResolvedIngredient } from '@/lib/types';
import { useClientCapability } from '@/lib/use-client-capability';

/**
 * Scan a product barcode with the device camera.
 *
 * Detection uses the native BarcodeDetector API (Chrome, Edge, Android). Where
 * that is missing — Safari and Firefox today — the camera is skipped entirely
 * and the panel falls back to typing the number off the packet, which is slower
 * but works everywhere.
 *
 * The lookup itself happens server-side in /api/barcode.
 */

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

function getDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null;
}

interface LookupResult {
  code: string;
  found: boolean;
  product: { name: string | null; brand: string | null; quantity: string | null } | null;
  ingredient: ResolvedIngredient | null;
  resolvedFrom: string | null;
}

interface Props {
  onClose: () => void;
  /** Called with the canonical ingredient name once a scan resolves. */
  onAdd: (value: string) => void;
}

export function BarcodeScanner({ onClose, onAdd }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);

  // Detector availability is a static browser fact; camera access is a runtime
  // permission. Keeping them separate means the effect never has to setState
  // synchronously just to report "this browser can't do it".
  const detectorSupported = useClientCapability(
    () => getDetectorCtor() !== null && Boolean(navigator.mediaDevices?.getUserMedia),
  );
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'looking-up'>('idle');
  const [result, setResult] = useState<LookupResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const lookup = useCallback(async (code: string) => {
    setStatus('looking-up');
    setLookupError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/barcode?code=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Lookup failed');
      setResult(data as LookupResult);
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setStatus('idle');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    // Nothing to start where the browser has no detector — the panel renders
    // its manual-entry fallback instead.
    if (!detectorSupported) return;

    const Detector = getDetectorCtor();
    if (!Detector) return;

    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setCameraReady(true);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const detector = new Detector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'],
        });

        // Polling beats requestAnimationFrame here: detection is the expensive
        // part and four checks a second is plenty to feel instant.
        scanTimerRef.current = window.setInterval(async () => {
          const video = videoRef.current;
          if (!video || video.readyState < 2) return;
          try {
            const codes = await detector.detect(video);
            if (codes.length > 0 && codes[0].rawValue) {
              stopCamera();
              void lookup(codes[0].rawValue);
            }
          } catch {
            // A single failed frame is not worth surfacing.
          }
        }, 250);
      } catch (err) {
        if (cancelled) return;
        setCameraReady(false);
        setCameraError(
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow it in your browser settings, or type the number below.'
            : 'No camera available — type the barcode number below.',
        );
      }
    })();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [detectorSupported, lookup, stopCamera]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const accept = (name: string) => {
    onAdd(name);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="scanner-title"
        className="w-full max-w-md overflow-hidden rounded-t-2xl border border-border bg-surface sm:rounded-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-border p-4">
          <h2 id="scanner-title" className="text-lg font-bold">
            <span aria-hidden>📷</span> Scan a barcode
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scanner"
            className="rounded-lg px-2 py-1 text-muted hover:bg-surface-muted hover:text-foreground"
          >
            ✕
          </button>
        </header>

        <div className="p-4">
          {detectorSupported && !cameraReady && !cameraError && !result && (
            <p className="py-6 text-center text-sm text-muted">Starting camera…</p>
          )}

          {detectorSupported && cameraReady && !result && (
            <div className="relative overflow-hidden rounded-xl bg-black">
              <video ref={videoRef} playsInline muted className="h-56 w-full object-cover" />
              <div
                className="pointer-events-none absolute inset-x-6 top-1/2 h-24 -translate-y-1/2 rounded-lg border-2 border-white/80"
                aria-hidden
              />
            </div>
          )}

          {(!detectorSupported || cameraError) && !result && (
            <p className="rounded-xl bg-surface-muted p-3 text-xs text-muted">
              {cameraError ??
                'Live scanning needs the BarcodeDetector API, which this browser does not have. Type the number printed under the barcode instead.'}
            </p>
          )}

          {!result && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (manualCode.trim()) void lookup(manualCode.trim());
              }}
              className="mt-3 flex gap-2"
            >
              <input
                type="text"
                inputMode="numeric"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Or type the barcode number"
                className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm
                           placeholder:text-muted focus:border-brand focus:outline-none"
              />
              <button
                type="submit"
                disabled={status === 'looking-up' || !manualCode.trim()}
                className="rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white
                           hover:bg-brand-strong disabled:opacity-50"
              >
                {status === 'looking-up' ? '…' : 'Look up'}
              </button>
            </form>
          )}

          {lookupError && (
            <p role="alert" className="mt-3 text-sm text-score-low">
              {lookupError}
            </p>
          )}

          {result && (
            <div className="mt-1">
              {result.ingredient?.name ? (
                <>
                  <p className="text-sm text-muted">
                    Scanned <span className="font-mono text-xs">{result.code}</span>
                    {result.product?.name ? ` — ${result.product.name}` : ''}
                  </p>
                  <p className="mt-2 text-lg font-bold">{result.ingredient.name}</p>
                  {result.resolvedFrom && (
                    <p className="text-xs text-muted">matched on “{result.resolvedFrom}”</p>
                  )}
                  <button
                    type="button"
                    onClick={() => accept(result.ingredient!.name!)}
                    className="mt-3 w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-strong"
                  >
                    Add {result.ingredient.name} to pantry
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm">
                    {result.found
                      ? `Found "${result.product?.name ?? 'that product'}", but we couldn't match it to an ingredient we know.`
                      : `Barcode ${result.code} isn't in the product database.`}
                  </p>
                  {result.found && result.product?.name && (
                    <button
                      type="button"
                      onClick={() => accept(result.product!.name!)}
                      className="mt-3 w-full rounded-xl border-2 border-brand px-4 py-2.5 text-sm font-semibold text-brand hover:bg-brand-soft"
                    >
                      Add it as “{result.product.name}” anyway
                    </button>
                  )}
                </>
              )}

              <button
                type="button"
                onClick={() => {
                  setResult(null);
                  setManualCode('');
                }}
                className="mt-2 w-full rounded-xl border border-border px-4 py-2 text-sm text-muted hover:border-brand hover:text-brand"
              >
                Scan another
              </button>
            </div>
          )}

          <p className="mt-3 text-xs text-muted">
            Barcodes are looked up against Open Food Facts, a public product database. Only the
            number is sent — nothing about you or your pantry.
          </p>
        </div>
      </div>
    </div>
  );
}
