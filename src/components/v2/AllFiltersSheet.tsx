'use client';

import type { ReactNode } from 'react';
import { Button } from './Button';
import { Sheet } from './Sheet';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Usually one FilterOptionList per filter. */
  children: ReactNode;
  onClearAll: () => void;
  /** Recipes matching the current selection, for the confirm button. */
  resultCount: number;
}

/** Mobile "All filters": every filter in one sheet, with Clear all and a results button. */
export function AllFiltersSheet({ open, onClose, children, onClearAll, resultCount }: Props) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="All filters"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClearAll} className="flex-1">
            Clear all
          </Button>
          <Button onClick={onClose} className="flex-[2]">
            Show {resultCount} {resultCount === 1 ? 'recipe' : 'recipes'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">{children}</div>
    </Sheet>
  );
}
