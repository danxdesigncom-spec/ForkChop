'use client';

import { useRef, type KeyboardEvent } from 'react';
import { cn } from './cn';

export type MatchTab = 'ready' | 'almost' | 'all';

interface Props {
  counts: Record<MatchTab, number>;
  selected: MatchTab;
  onSelect: (tab: MatchTab) => void;
  /** id of the role=tabpanel these tabs control. */
  panelId: string;
  block?: boolean;
}

const TABS: { id: MatchTab; label: string }[] = [
  { id: 'ready', label: 'Ready' },
  { id: 'almost', label: 'Almost' },
  { id: 'all', label: 'All' },
];

export function tabId(tab: MatchTab): string {
  return `match-tab-${tab}`;
}

/**
 * Ready · N / Almost · N / All · N. Replaces v1's stat tiles, which led with
 * "0". Roving tabindex with arrow keys, Home and End, per the ARIA tabs pattern.
 */
export function MatchTabs({ counts, selected, onSelect, panelId, block }: Props) {
  const refs = useRef<Record<MatchTab, HTMLButtonElement | null>>({ ready: null, almost: null, all: null });

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = -1;
    if (e.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const tab = TABS[next].id;
    onSelect(tab);
    refs.current[tab]?.focus();
  }

  return (
    <div role="tablist" aria-label="Match" className={cn('flex gap-0.5 rounded-xl bg-raised p-1', block && 'w-full')}>
      {TABS.map((tab, i) => {
        const active = tab.id === selected;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[tab.id] = el;
            }}
            id={tabId(tab.id)}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={panelId}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'h-10 whitespace-nowrap rounded-[9px] px-3.5 text-sm',
              block && 'flex-1',
              active ? 'bg-selected font-semibold text-foreground shadow-sm' : 'font-medium text-muted',
            )}
          >
            {tab.label} · {counts[tab.id]}
          </button>
        );
      })}
    </div>
  );
}
