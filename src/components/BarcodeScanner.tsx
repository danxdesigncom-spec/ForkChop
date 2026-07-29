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
 * Scan a product barcode with the device camera.
 *
 * Detection prefers the browser's native BarcodeDetector and falls back to
 * ZXing, loaded on demand, so iOS Safari and Firefox work too. Where the camera
 * itself is unavailable or refused, the panel still accepts the number typed
 * off the packet — every route ends in the same lookup.
 *
 * The lookup runs server-side in /api/barcode: Open Food Facts requires a
 * custom User-Agent, which browsers are not permitted to set.
 */

interface LookupResult {
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
 * Why the camera is not running. Each maps to different advice, which is the
 * whole point of distinguishing them — "blocked" needs a settings change,
 * "unsupported" does not.
 */
type CameraState =
  | { kind: 'starting' }
  | { kind: 'running'; backend: DetectorBackend }
  | { kind: 'loading-decoder' }
  | { kind: 'blocked' }
  | { kind: 'no-camera' }
  | { kind: 'unsupported' }
  | { kind: 'failed'; message: string };

interface Props {
  onClose: () => void;
  /** Called with the ingredient name and the barcode it came from. */
  onAdd: (value: string, barcode: string) => void;
}

export function BarcodeScanner({ onClose, onAdd }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorHandle | null>(null);
  const timerRef = useRef<number | null>(null);
  const busyRef = useRef(false);

  const cameraAvailable = useClientCapability(hasCameraSupport);

  const [camera, setCamera] = useState<CameraState>({ kind: 'starting' });
  const [manualCode, setManualCode] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'looking-up'>('idle');
  const [result, setResult] = useState<LookupResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    detectorRef.current?.dispose();
    detectorRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
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

  useEffect(() => {
    // Nothing to start. The unsupported state is derived below rather than
    // set here, so the effect never has to setState synchronously.
    if (!cameraAvailable) return;

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
  }, [cameraAvailable, lookup, stopCamera]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const accept = (name: string, barcode: string) => {
    onAdd(name, barcode);
    onClose();
  };

  const submitManual = (event: React.FormEvent) => {
    event.preventDefault();
    const code = manualCode.trim();
    if (!isValidBarcode(code)) {
      setManualError('A barcode is 8 to 14 digits, with no spaces.');
      return;
    }
    setManualError(null);
    void lookup(code);
  };

  /**
   * A browser with no camera API can never leave 'unsupported', so it is
   * derived from the capability rather than stored.
   */
  const cameraState: CameraState = cameraAvailable ? camera : { kind: 'unsupported' };

  const cameraNotice: string | null =
    cameraState.kind === 'blocked'
      ? 'Camera access was blocked. Allow it in your browser settings, or type the number below.'
      : cameraState.kind === 'no-camera'
        ? 'No camera found on this device — type the number printed under the barcode.'
        : cameraState.kind === 'unsupported'
          ? 'This browser cannot open a camera. Type the number printed under the barcode.'
          : cameraState.kind === 'failed'
            ? `${cameraState.message} Type the number below instead.`
            : null;

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
          {!result && (
            <>
              {(cameraState.kind === 'starting' || cameraState.kind === 'loading-decoder') && (
                <p className="py-6 text-center text-sm text-muted" aria-live="polite">
                  {cameraState.kind === 'loading-decoder'
                    ? 'Loading the barcode reader…'
                    : 'Starting camera…'}
                </p>
              )}

              {/* Kept mounted whenever the camera might run: the ref must exist
                  before play() is called. */}
              <div className={cameraState.kind === 'running' ? 'block' : 'hidden'}>
                <div className="relative overflow-hidden rounded-xl bg-black">
                  <video ref={videoRef} playsInline muted className="h-56 w-full object-cover" />
                  <div
                    className="pointer-events-none absolute inset-x-6 top-1/2 h-24 -translate-y-1/2 rounded-lg border-2 border-white/80"
                    aria-hidden
                  />
                </div>
                <p className="mt-1.5 text-center text-xs text-muted">
                  Hold the barcode inside the frame
                  {cameraState.kind === 'running' && cameraState.backend === 'zxing' && ' — this may take a moment'}
                </p>
              </div>

              {cameraNotice && (
                <p className="rounded-xl bg-surface-muted p-3 text-xs text-muted">{cameraNotice}</p>
              )}

              {status === 'looking-up' && (
                <p className="py-4 text-center text-sm text-muted" aria-live="polite">
                  Looking that up…
                </p>
              )}

              <form onSubmit={submitManual} className="mt-3 flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={manualCode}
                  onChange={(e) => {
                    setManualCode(e.target.value);
                    setManualError(null);
                  }}
                  placeholder="Or type the barcode number"
                  aria-label="Barcode number"
                  aria-invalid={manualError ? true : undefined}
                  className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm
                             placeholder:text-muted focus:border-brand focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={status === 'looking-up' || !manualCode.trim()}
                  className="rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white
                             hover:bg-brand-strong disabled:opacity-50"
                >
                  Look up
                </button>
              </form>

              {manualError && (
                <p role="alert" className="mt-1.5 text-xs text-score-low">
                  {manualError}
                </p>
              )}
            </>
          )}

          {lookupError && (
            <p role="alert" className="mt-3 text-sm text-score-low">
              {lookupError}
            </p>
          )}

          {result && (
            <ScanResult
              result={result}
              onAccept={(name) => accept(name, result.code)}
              onAgain={() => setResult(null)}
            />
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

/**
 * Outcome of a lookup.
 *
 * Three cases, each with a different next step: we know the ingredient, we know
 * the product but not the ingredient, or the barcode is simply unknown. The
 * last two still let the user add something rather than dead-ending.
 */
function ScanResult({
  result,
  onAccept,
  onAgain,
}: {
  result: LookupResult;
  onAccept: (name: string) => void;
  onAgain: () => void;
}) {
  const productName = result.product?.name?.trim();

  return (
    <div>
      {result.product?.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={result.product.imageUrl}
          alt=""
          className="mx-auto mb-3 h-28 rounded-xl object-contain"
        />
      )}

      {result.ingredient?.name ? (
        <>
          <p className="text-sm text-muted">
            Scanned <span className="font-mono text-xs">{result.code}</span>
            {productName ? ` — ${productName}` : ''}
            {result.product?.brand ? ` (${result.product.brand})` : ''}
          </p>
          <p className="mt-2 text-lg font-bold">{result.ingredient.name}</p>
          {result.resolvedFrom && (
            <p className="text-xs text-muted">matched on “{result.resolvedFrom}”</p>
          )}
          <button
            type="button"
            onClick={() => onAccept(result.ingredient!.name!)}
            className="mt-3 w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-strong"
          >
            Add {result.ingredient.name} to pantry
          </button>
        </>
      ) : (
        <>
          <p className="text-sm">
            {result.found && productName
              ? `Found “${productName}”, but we couldn’t match it to an ingredient we know.`
              : `Barcode ${result.code} isn’t in the product database.`}
          </p>
          {result.found && productName && (
            <button
              type="button"
              onClick={() => onAccept(productName)}
              className="mt-3 w-full rounded-xl border-2 border-brand px-4 py-2.5 text-sm font-semibold text-brand hover:bg-brand-soft"
            >
              Add it as “{productName}” anyway
            </button>
          )}
          <p className="mt-3 text-xs text-muted">
            You can also close this and type the ingredient straight into your kitchen list.
          </p>
        </>
      )}

      <button
        type="button"
        onClick={onAgain}
        className="mt-2 w-full rounded-xl border border-border px-4 py-2 text-sm text-muted hover:border-brand hover:text-brand"
      >
        Scan another
      </button>
    </div>
  );
}
