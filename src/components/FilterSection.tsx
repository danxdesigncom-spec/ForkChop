'use client';

import { useId, useState } from 'react';

/**
 * A collapsible sidebar section. Open by default — the filters should be
 * discoverable without hunting — but foldable, because the panel is long once
 * diet, region, meal, allergies and dislikes all live in it.
 */
export function FilterSection({
  title,
  emoji,
  /** Shown next to the title when collapsed, e.g. how many filters are active. */
  badge,
  defaultOpen = true,
  children,
}: {
  title: string;
  emoji?: string;
  badge?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <section className="border-b border-border pb-3 last:border-b-0 last:pb-0">
      <h2>
        {/*
          Header hit area is 44px on mobile, matching the same tap-target
          minimum used for the save-heart. On desktop it stays comfortably
          large for a mouse. Whole row is clickable, not just the caret.
         */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={contentId}
          className="group flex min-h-[44px] w-full items-center gap-2 rounded-lg py-2 text-left text-xs font-bold uppercase tracking-wide text-muted transition-colors hover:bg-surface-muted hover:text-brand focus-visible:bg-surface-muted"
        >
          {emoji && (
            <span aria-hidden className="text-sm">
              {emoji}
            </span>
          )}
          <span className="flex-1">{title}</span>
          {badge !== undefined && badge > 0 && (
            <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
              {badge}
            </span>
          )}
          {/*
            Chevron in a filled circle so it reads as a control at a glance,
            on desktop and mobile. size-6 with a brand-tinted background;
            rotates 180° when open (down = expanded).
           */}
          <span
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-strong transition-all group-hover:bg-brand group-hover:text-white"
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </button>
      </h2>

      {/* Kept mounted so collapsing never loses in-progress input. */}
      <div id={contentId} hidden={!open} className="pt-1">
        {children}
      </div>
    </section>
  );
}
