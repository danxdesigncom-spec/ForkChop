'use client';

/**
 * Barcode detection, with two backends behind one interface.
 *
 *   native  - the browser's BarcodeDetector. Free, fast, no download.
 *             Chrome and Android; also Edge. Not Safari or Firefox.
 *   zxing   - @zxing/browser, a pure-JS decoder. Works everywhere,
 *             including iOS Safari, at the cost of a sizeable download.
 *
 * ZXing is loaded with a dynamic import so it only reaches users who both
 * lack the native API and actually open the scanner. Bundling it statically
 * would put ~5 MB of decoder in front of every visitor for a feature most
 * never touch.
 */

export type DetectorBackend = 'native' | 'zxing';

/** Retail barcodes. Narrowing the set makes both decoders faster and steadier. */
const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];

export interface BarcodeDetectorHandle {
  backend: DetectorBackend;
  /** Returns the first barcode visible in the frame, or null. */
  detect(video: HTMLVideoElement): Promise<string | null>;
  /** Release anything the backend holds. Safe to call twice. */
  dispose(): void;
}

interface NativeDetectedBarcode {
  rawValue: string;
}
interface NativeDetector {
  detect(source: CanvasImageSource): Promise<NativeDetectedBarcode[]>;
}
type NativeDetectorCtor = new (options?: { formats?: string[] }) => NativeDetector;

export function getNativeDetectorCtor(): NativeDetectorCtor | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector ?? null;
}

export function hasCameraSupport(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

function createNativeHandle(Ctor: NativeDetectorCtor): BarcodeDetectorHandle {
  const detector = new Ctor({ formats: NATIVE_FORMATS });
  return {
    backend: 'native',
    async detect(video) {
      const codes = await detector.detect(video);
      return codes[0]?.rawValue ?? null;
    },
    dispose() {},
  };
}

async function createZxingHandle(): Promise<BarcodeDetectorHandle> {
  const { BrowserMultiFormatReader } = await import('@zxing/browser');
  const reader = new BrowserMultiFormatReader();

  /**
   * ZXing's video helpers are continuous-callback or block-until-found, neither
   * of which fits a polling loop. `decodeFromCanvas` is the single-frame door
   * in, so each tick paints the current frame to an offscreen canvas and
   * decodes that — one control flow shared with the native backend.
   */
  let canvas: HTMLCanvasElement | null = null;

  return {
    backend: 'zxing',
    async detect(video) {
      if (!video.videoWidth || !video.videoHeight) return null;

      if (!canvas) canvas = document.createElement('canvas');
      if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
      if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;

      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return null;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      try {
        return reader.decodeFromCanvas(canvas).getText();
      } catch {
        // NotFoundException fires on every frame without a barcode, which is
        // the overwhelmingly common case rather than an error worth surfacing.
        return null;
      }
    },
    dispose() {
      canvas = null;
    },
  };
}

/**
 * Pick the best available backend.
 *
 * Native is preferred purely because it costs nothing to load; where it is
 * missing, ZXing is fetched on demand.
 */
export async function createDetector(): Promise<BarcodeDetectorHandle> {
  const Ctor = getNativeDetectorCtor();
  if (Ctor) return createNativeHandle(Ctor);
  return createZxingHandle();
}

/** Which backend `createDetector` would choose, without loading anything. */
export function plannedBackend(): DetectorBackend {
  return getNativeDetectorCtor() ? 'native' : 'zxing';
}

/**
 * A barcode is 8–14 digits (EAN-8 through GTIN-14).
 *
 * Shared by the scanner and the manual-entry field so both reject the same
 * things, and so a misread frame never reaches the network.
 */
export function isValidBarcode(code: string): boolean {
  return /^\d{8,14}$/.test(code.trim());
}
