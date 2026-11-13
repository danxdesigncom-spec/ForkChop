'use client';

import { useEffect, useRef } from 'react';

/**
 * Auto-reveals more results when the user scrolls to the end of the list.
 *
 * A single IntersectionObserver watches an invisible bottom sentinel; the
 * moment it intersects the viewport, `onReveal` fires. Cheap, no scroll
 * listener, no debouncing needed.
 *
 * Renders a visible "Show more" button too, so keyboard users and anyone
 * whose browser blocks IntersectionObserver still has a way forward.
 */
export function InfiniteScrollSentinel({
  onReveal,
  hasMore,
  totalShown,
  totalAvailable,
}: {
  onReveal: () => void;
  hasMore: boolean;
  totalShown: number;
  totalAvailable: number;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Only observe while there's more to show — otherwise a Reveal keeps
    // firing every time the empty tail rolls back into view.
    if (!hasMore) return;

    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) onReveal();
        }
      },
      // 200px margin so the next batch loads just before the user hits the
      // real bottom — feels like a continuous list rather than a stutter.
      { rootMargin: '200px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, onReveal]);

  return (
    <div className="mt-6 flex flex-col items-center gap-2">
      <p className="text-xs text-muted tabular-nums">
        Showing {totalShown} of {totalAvailable}
      </p>
      {hasMore && (
        <>
          <button
            type="button"
            onClick={onReveal}
            className="rounded-xl border-2 border-border bg-surface px-4 py-2 text-sm font-semibold hover:border-brand hover:text-brand"
          >
            Show more
          </button>
          <div ref={sentinelRef} aria-hidden className="h-px w-full" />
        </>
      )}
    </div>
  );
}
