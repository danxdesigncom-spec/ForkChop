'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { pageItems, pageWindow, showingLabel } from '@/lib/v2/pagination';
import { cn } from './cn';

interface Props {
  total: number;
  pageSize: number;
  page: number;
  /** Builds the link for a page, e.g. `?page=2`. Pages are real links. */
  hrefFor: (page: number) => string;
  /** Optional client-side handler; the href still works without JS. */
  onNavigate?: (page: number) => void;
}

const BOX = 'inline-flex h-11 items-center justify-center rounded-xl text-[15px]';
const IDLE = 'border border-border bg-surface text-foreground hover:border-line-strong';
const DISABLED = 'cursor-not-allowed bg-raised text-muted';

/** Previous / page numbers / Next, with "Showing 1–6 of 21" as a status. */
export function Pagination({ total, pageSize, page, hrefFor, onNavigate }: Props) {
  const w = pageWindow(total, pageSize, page);
  if (w.total === 0) return null;

  const link = (p: number) => ({
    href: hrefFor(p),
    onClick: onNavigate
      ? (e: React.MouseEvent) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          onNavigate(p);
        }
      : undefined,
  });

  const previous = w.hasPrevious ? (
    <a {...link(w.page - 1)} aria-label="Previous page" className={cn(BOX, IDLE, 'w-11 gap-1 font-semibold sm:w-auto sm:pl-2.5 sm:pr-3.5')}>
      <ChevronLeft aria-hidden="true" size={18} />
      <span className="hidden sm:inline">Previous</span>
    </a>
  ) : (
    <button type="button" disabled aria-label="Previous page" className={cn(BOX, DISABLED, 'w-11 gap-1 font-medium sm:w-auto sm:pl-2.5 sm:pr-3.5')}>
      <ChevronLeft aria-hidden="true" size={18} />
      <span className="hidden sm:inline">Previous</span>
    </button>
  );

  const next = w.hasNext ? (
    <a {...link(w.page + 1)} aria-label="Next page" className={cn(BOX, IDLE, 'gap-1 pl-3.5 pr-2.5 font-semibold')}>
      Next
      <ChevronRight aria-hidden="true" size={18} />
    </a>
  ) : (
    <button type="button" disabled aria-label="Next page" className={cn(BOX, DISABLED, 'gap-1 pl-3.5 pr-2.5 font-medium')}>
      Next
      <ChevronRight aria-hidden="true" size={18} />
    </button>
  );

  return (
    <nav aria-label="Recipe pages" className="flex items-center justify-between gap-2 border-t border-border pt-6">
      <p role="status" className="hidden text-sm text-muted sm:block">
        {showingLabel(w)}
      </p>
      <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
        {previous}
        <p role="status" className="text-sm text-muted sm:hidden">
          Page <strong className="text-foreground">{w.page}</strong> of {w.totalPages}
        </p>
        <ol className="hidden items-center gap-2 sm:flex">
          {pageItems(w.page, w.totalPages).map((item) =>
            item.kind === 'gap' ? (
              <li key={item.key} aria-hidden="true" className="px-1 text-muted">
                …
              </li>
            ) : (
              <li key={item.page}>
                <a
                  {...link(item.page)}
                  aria-current={item.page === w.page ? 'page' : undefined}
                  aria-label={item.page === w.page ? `Page ${item.page}, current page` : `Page ${item.page}`}
                  className={cn(BOX, 'w-11', item.page === w.page ? 'bg-brand font-semibold text-on-brand' : cn(IDLE, 'font-medium'))}
                >
                  {item.page}
                </a>
              </li>
            ),
          )}
        </ol>
        {next}
      </div>
    </nav>
  );
}
