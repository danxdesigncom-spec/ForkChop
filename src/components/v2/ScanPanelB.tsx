'use client';

import { Check, Flashlight, FlashlightOff, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { isValidBarcode, useBarcodeScan, type CameraState, type LookupResult } from '@/hooks/useBarcodeScan';
import { Button } from './Button';
import { cn } from './cn';
import { useFocusTrap } from './use-dismiss';

/**
 * v2B scan shells (docs/redesign/07-ingredient-bar-b.md §4). Detection and
 * lookup are `useBarcodeScan`, shared with the v1 modal; only the shell is new.
 *
 * Never auto-adds: every match waits for "Add {ingredient}".
 *
 * - Desktop: a non-modal panel anchored under the field. Esc or a click outside
 *   closes it and focus goes back to Scan. Add closes it.
 * - Mobile: a full-screen dialog over the camera. Add keeps it open so a whole
 *   shopping bag can be scanned in one go; Close returns to the page.
 */

interface Props {
  variant: 'panel' | 'fullscreen';
  onClose: () => void;
  /** The ingredient name to add and the barcode it came from. */
  onAdd: (name: string, barcode: string) => void;
  /** "Not right? Search instead": close and put this text in the field. */
  onSearchInstead: (text: string) => void;
  /** The Scan button, for focus return and outside-click detection. */
  triggerRef: RefObject<HTMLElement | null>;
}

export function ScanPanelB(props: Props) {
  return props.variant === 'panel' ? <DesktopPanel {...props} /> : <FullScreenScanner {...props} />;
}

/* ------------------------------------------------------------ shared parts */

function cameraMessage(camera: CameraState): string | null {
  switch (camera.kind) {
    case 'blocked':
      return 'ForkChop needs camera access to scan. You can type the number instead.';
    case 'no-camera':
    case 'unsupported':
      return 'This device can’t open a camera. You can type the number instead.';
    case 'failed':
      return `${camera.message} You can type the number instead.`;
    default:
      return null;
  }
}

/** Corner brackets and a guide line, drawn over the live video. */
function Frame({ large }: { large?: boolean }) {
  const corner = cn('absolute border-white', large ? 'h-8 w-8 border-4' : 'h-[22px] w-[22px] border-[3px]');
  return (
    <div aria-hidden="true" className={cn('pointer-events-none relative', large ? 'h-40 w-[260px]' : 'h-[56%] w-[44%]')}>
      <span className={cn(corner, 'left-0 top-0 rounded-tl-[10px] border-b-0 border-r-0')} />
      <span className={cn(corner, 'right-0 top-0 rounded-tr-[10px] border-b-0 border-l-0')} />
      <span className={cn(corner, 'bottom-0 left-0 rounded-bl-[10px] border-r-0 border-t-0')} />
      <span className={cn(corner, 'bottom-0 right-0 rounded-br-[10px] border-l-0 border-t-0')} />
      <span className="absolute inset-x-4 top-1/2 h-0.5 bg-white/70" />
    </div>
  );
}

function ManualEntry({ onLookup, busy, autoFocus }: { onLookup: (code: string) => void; busy: boolean; autoFocus?: boolean }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const errorId = `${id}-error`;

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!isValidBarcode(trimmed)) {
      setError('A barcode is 8 to 14 digits, with no spaces.');
      return;
    }
    setError(null);
    onLookup(trimmed);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-foreground">
        Barcode number
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          autoFocus={autoFocus}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="field h-11 min-w-0 flex-1 rounded-xl bg-surface px-3 font-mono text-base text-foreground outline-none"
        />
        <Button type="submit" disabled={busy || !code.trim()}>
          Look up
        </Button>
      </div>
      {error && (
        <p id={errorId} className="text-sm text-radish-text">
          {error}
        </p>
      )}
    </form>
  );
}

/** The outcome of a lookup, with the next step for each case. */
function Outcome({
  result,
  large,
  onAdd,
  onScanAnother,
  onSearchInstead,
}: {
  result: LookupResult;
  large?: boolean;
  onAdd: (name: string) => void;
  onScanAnother: () => void;
  onSearchInstead: (text: string) => void;
}) {
  const product = result.product?.name?.trim() || null;
  const ingredient = result.ingredient?.name ?? null;

  if (ingredient) {
    return (
      <div className={cn('flex gap-3', large ? 'flex-col' : 'flex-wrap items-center rounded-xl bg-raised p-3')}>
        <div role="status" className="flex min-w-0 flex-1 items-center gap-3">
          <span
            aria-hidden="true"
            className={cn('inline-flex shrink-0 items-center justify-center text-brand', large && 'h-11 w-11 rounded-xl bg-brand-soft')}
          >
            <Check size={20} />
          </span>
          <span className="flex min-w-0 flex-col">
            {product && <span className="truncate text-[13px] text-muted">Found &ldquo;{product}&rdquo;</span>}
            <span className={cn('font-semibold text-foreground', large ? 'text-lg' : 'text-[15px]')}>Adds as {ingredient}</span>
          </span>
        </div>
        {large ? (
          <>
            <Button block className="min-h-[52px] text-base" onClick={() => onAdd(ingredient)}>
              Add {ingredient}
            </Button>
            <Button block variant="secondary" onClick={() => onSearchInstead(product ?? ingredient)}>
              Not right? Search instead
            </Button>
          </>
        ) : (
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" className="sm:min-h-11!" onClick={onScanAnother}>
              Scan another
            </Button>
            <Button className="sm:min-h-11!" onClick={() => onAdd(ingredient)}>
              Add {ingredient}
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Found the product but not an ingredient we know, or not found at all.
  return (
    <div className="flex flex-col gap-3">
      <p role="status" className="text-[15px] text-foreground">
        {result.found && product ? (
          <>
            Found &ldquo;{product}&rdquo;, but we don&apos;t know which ingredient it is.
          </>
        ) : (
          'We couldn’t find that barcode.'
        )}
      </p>
      <div className={cn('flex gap-2', large && 'flex-col')}>
        <Button variant={large ? 'primary' : 'secondary'} block={large} onClick={() => onSearchInstead(product ?? '')}>
          {large ? 'Not right? Search instead' : 'Search instead'}
        </Button>
        <Button variant="secondary" block={large} onClick={onScanAnother}>
          Scan another
        </Button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- desktop */

function DesktopPanel({ onClose, onAdd, onSearchInstead, triggerRef }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const [typing, setTyping] = useState(false);
  const { videoRef, camera, status, result, lookupError, lookup, scanAgain } = useBarcodeScan({ active: !typing });
  const message = cameraMessage(camera);
  const showManual = typing || message !== null;

  // Esc or a press outside closes; Esc also returns focus to Scan. Closing
  // unmounts the panel, and unmounting stops the camera tracks.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
      triggerRef.current?.focus();
    }
    function onPointer(e: PointerEvent) {
      const target = e.target as Node;
      if (panel.current?.contains(target) || triggerRef.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [onClose, triggerRef]);

  return (
    <div
      ref={panel}
      role="dialog"
      aria-label="Scan a barcode"
      className="absolute inset-x-0 top-full z-50 mt-2 flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3 shadow-lg"
    >
      {!result && !showManual && (
        <div className="relative flex h-[150px] items-center justify-center overflow-hidden rounded-xl bg-black">
          <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
          <Frame />
          <span className="absolute bottom-2.5 text-[13px] text-white">
            {status === 'looking-up'
              ? 'Looking that up…'
              : camera.kind === 'running'
                ? 'Hold a barcode inside the frame'
                : camera.kind === 'loading-decoder'
                  ? 'Loading the barcode reader…'
                  : 'Starting camera…'}
          </span>
        </div>
      )}

      {message && !result && <p className="text-sm text-muted">{message}</p>}

      {showManual && !result && (
        <ManualEntry onLookup={(code) => void lookup(code)} busy={status === 'looking-up'} autoFocus={typing} />
      )}

      {lookupError && (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="flex-1 text-sm text-radish-text">
            {lookupError}
          </p>
          <Button variant="secondary" onClick={scanAgain}>
            Scan another
          </Button>
        </div>
      )}

      {result && (
        <Outcome
          result={result}
          onAdd={(name) => {
            onAdd(name, result!.code);
            onClose();
          }}
          onScanAnother={() => {
            setTyping(false);
            scanAgain();
          }}
          onSearchInstead={onSearchInstead}
        />
      )}

      {!result && !message && (
        <button
          type="button"
          onClick={() => setTyping((v) => !v)}
          className="inline-flex min-h-8 self-start items-center px-1 text-sm font-semibold text-brand underline underline-offset-[3px]"
        >
          {typing ? 'Use the camera instead' : 'Type the barcode number instead'}
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- mobile */

function FullScreenScanner({ onClose, onAdd, onSearchInstead }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [typing, setTyping] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  const { videoRef, camera, status, result, lookupError, lookup, scanAgain, torch } = useBarcodeScan({ active: !typing });
  const message = cameraMessage(camera);
  const showManual = typing || message !== null;
  useFocusTrap(true, panel);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const roundButton = 'inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white';

  // Portalled: the sticky header's backdrop-blur would otherwise become the
  // containing block for `position: fixed` and clip the scanner to the header.
  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-black"
    >
      <video
        ref={videoRef}
        playsInline
        muted
        className={cn('absolute inset-0 h-full w-full object-cover', (result || showManual) && 'opacity-40')}
      />
      <div className="relative flex h-[72px] shrink-0 items-center justify-between px-3 pt-3">
        <button type="button" aria-label="Close scanner" onClick={onClose} className={roundButton}>
          <X aria-hidden="true" size={20} />
        </button>
        <h2 id={titleId} className="text-[17px] font-semibold text-white">
          Scan a barcode
        </h2>
        {torch.available ? (
          <button
            type="button"
            aria-label="Torch"
            aria-pressed={torch.on}
            onClick={() => void torch.toggle()}
            className={roundButton}
          >
            {torch.on ? <Flashlight aria-hidden="true" size={20} /> : <FlashlightOff aria-hidden="true" size={20} />}
          </button>
        ) : (
          <span aria-hidden="true" className="h-11 w-11" />
        )}
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center gap-5 pb-10">
        {!result && !showManual && (
          <>
            <Frame large />
            <p className="text-[15px] text-white">
              {status === 'looking-up'
                ? 'Looking that up…'
                : camera.kind === 'running'
                  ? 'Hold a barcode inside the frame'
                  : camera.kind === 'loading-decoder'
                    ? 'Loading the barcode reader…'
                    : 'Starting camera…'}
            </p>
          </>
        )}
      </div>

      <div className="relative flex shrink-0 flex-col gap-3 rounded-t-3xl bg-surface px-4 pb-7 pt-2.5">
        <span aria-hidden="true" className="mx-auto h-1 w-10 rounded-full bg-line-strong" />

        {message && !result && <p className="text-[15px] text-foreground">{message}</p>}
        {showManual && !result && (
          <ManualEntry onLookup={(code) => void lookup(code)} busy={status === 'looking-up'} autoFocus={typing} />
        )}

        {lookupError && (
          <>
            <p role="alert" className="text-sm text-radish-text">
              {lookupError}
            </p>
            <Button block variant="secondary" onClick={scanAgain}>
              Scan another
            </Button>
          </>
        )}

        {result && (
          <Outcome
            large
            result={result}
            onAdd={(name) => {
              onAdd(name, result!.code);
              setAdded((list) => (list.includes(name) ? list : [...list, name]));
              // Stay in the scanner: ready for the next packet.
              setTyping(false);
              scanAgain();
            }}
            onScanAnother={() => {
              setTyping(false);
              scanAgain();
            }}
            onSearchInstead={onSearchInstead}
          />
        )}

        {added.length > 0 && <p className="text-[13px] text-muted">Added this session: {added.join(', ')}</p>}

        {!result && !message && (
          <button
            type="button"
            onClick={() => setTyping((v) => !v)}
            className="inline-flex min-h-8 self-start items-center text-sm font-semibold text-brand underline underline-offset-[3px]"
          >
            {typing ? 'Use the camera instead' : 'Type the barcode number instead'}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
