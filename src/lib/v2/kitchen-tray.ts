/**
 * Layout maths for the v2B "Your kitchen" tray (docs/redesign/07-ingredient-bar-b.md §3).
 *
 * The desktop tray wraps but is capped at two rows. When the chips don't all
 * fit, the last visible item becomes a "Show all N" button, so chips are dropped
 * from the end until that button fits too. Kept free of React and the DOM: the
 * component measures widths, this decides how many to show.
 */

export interface TrayLayoutOptions {
  /** Width available to the chip list, in px. */
  width: number;
  /** Horizontal gap between items, in px. */
  gap: number;
  /** Maximum number of rows before collapsing. */
  rows: number;
  /** Width of the "Show all N" button, in px. */
  moreWidth: number;
}

export interface TrayLayout {
  /** Chips to render, from the start of the list. */
  visible: number;
  /** Chips hidden behind "Show all N". 0 means no button. */
  hidden: number;
}

/** How many flex-wrap rows `widths` occupy in `width`. An item wider than a row gets one to itself. */
export function rowsUsed(widths: number[], width: number, gap: number): number {
  if (widths.length === 0) return 0;
  let rows = 1;
  let x = 0;
  for (const w of widths) {
    const needed = x === 0 ? w : x + gap + w;
    if (x > 0 && needed > width) {
      rows += 1;
      x = w;
    } else {
      x = needed;
    }
  }
  return rows;
}

export function layoutTray(chipWidths: number[], options: TrayLayoutOptions): TrayLayout {
  const { width, gap, rows, moreWidth } = options;
  const total = chipWidths.length;
  // Nothing measured yet (first paint, or a hidden tray): show everything
  // rather than guessing, and let the next measurement settle it.
  if (total === 0 || width <= 0) return { visible: total, hidden: 0 };
  if (rowsUsed(chipWidths, width, gap) <= rows) return { visible: total, hidden: 0 };

  for (let visible = total - 1; visible >= 0; visible -= 1) {
    const candidate = [...chipWidths.slice(0, visible), moreWidth];
    if (rowsUsed(candidate, width, gap) <= rows) return { visible, hidden: total - visible };
  }
  return { visible: 0, hidden: total };
}
