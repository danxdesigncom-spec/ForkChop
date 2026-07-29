'use client';

import { useEffect, useRef, useState } from 'react';
import { signOut } from '@/app/auth/actions';

/**
 * Signed-in control in the header, in the same slot the "Log in" button
 * occupies when signed out.
 *
 * Shows a truncated email — a full address would push the header around on
 * mobile — with the whole thing available on hover and to screen readers.
 */
export function AccountMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handle = email.split('@')[0];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={email}
        className="inline-flex items-center gap-1.5 rounded-xl border-2 border-border bg-surface px-3 py-2
                   text-sm font-semibold hover:border-brand hover:text-brand"
      >
        <span
          aria-hidden
          className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold uppercase text-white"
        >
          {handle.slice(0, 1)}
        </span>
        <span className="max-w-[9ch] truncate sm:max-w-[16ch]">{handle}</span>
        <span aria-hidden className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          ⌄
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 w-64 overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="text-xs text-muted">Signed in as</p>
            <p className="truncate text-sm font-semibold" title={email}>
              {email}
            </p>
          </div>

          <p className="px-4 py-2.5 text-xs text-muted">
            Your saved recipes follow you to any device you sign in on.
          </p>

          <form
            action={async () => {
              setSigningOut(true);
              await signOut();
            }}
          >
            <button
              type="submit"
              role="menuitem"
              disabled={signingOut}
              className="w-full border-t border-border px-4 py-2.5 text-left text-sm font-semibold
                         text-brand hover:bg-surface-muted disabled:opacity-60"
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
