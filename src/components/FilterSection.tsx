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
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={contentId}
          className="flex w-full items-center gap-2 py-2 text-left text-xs font-bold uppercase tracking-wide text-muted hover:text-brand"
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
          <span aria-hidden className={`transition-transform ${open ? 'rotate-90' : ''}`}>
            ›
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
