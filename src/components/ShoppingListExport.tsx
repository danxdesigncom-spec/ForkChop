'use client';

import { useState } from 'react';
import {
  formatAmountLabel,
  formatShoppingListText,
  groupShoppingList,
  shoppingListFilename,
  type ShoppingListItem,
} from '@/lib/shopping-list';
import { departmentIcon } from '@/lib/grocery/departments';

/**
 * The no-storefront option: a clean shopping list you can copy to the
 * clipboard, or download as a text file.
 *
 * Works entirely offline and needs no provider, which is why it is always
 * available even when no storefront is connected.
 */
export function ShoppingListExport({ items }: { items: ShoppingListItem[] }) {
  const [copied, setCopied] = useState(false);
  const groups = groupShoppingList(items);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatShoppingListText(items));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const download = () => {
    const blob = new Blob([formatShoppingListText(items)], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = shoppingListFilename();
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoking immediately can cancel the download in some browsers.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div>
      {/* The printable/screenshottable artifact itself. */}
      <div id="forkchop-shopping-list" className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-border pb-2">
          <h3 className="font-bold">
            <span aria-hidden>🍴</span> Shopping list
          </h3>
          <span className="text-xs text-muted">
            {items.length} item{items.length === 1 ? '' : 's'}
          </span>
        </div>

        {groups.map((group) => (
          <section key={group.department} className="mb-3 last:mb-0">
            <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
              <span aria-hidden>{departmentIcon(group.department)}</span> {group.department}
            </h4>
            <ul className="space-y-1">
              {group.items.map((item) => {
                const amount = formatAmountLabel(item);
                return (
                  <li key={item.ingredientId} className="flex items-baseline gap-2 text-sm">
                    <span aria-hidden className="text-muted">
                      ☐
                    </span>
                    <span>
                      <span className="font-medium">{item.name}</span>
                      {amount && <span className="text-muted"> — {amount}</span>}
                      {item.neededFor.length > 0 && (
                        <span className="block text-xs text-muted">
                          for {item.neededFor.join(', ')}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={copy}
          className="rounded-xl border-2 border-border px-3 py-2 text-sm font-semibold hover:border-brand hover:text-brand"
        >
          <span aria-hidden>{copied ? '✓' : '📋'}</span> {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          type="button"
          onClick={download}
          className="rounded-xl border-2 border-border px-3 py-2 text-sm font-semibold hover:border-brand hover:text-brand"
        >
          <span aria-hidden>⬇️</span> .txt
        </button>
      </div>

      <p className="mt-2 text-xs text-muted">
        Copy pastes into anything — Notes, a message, or a screenshot. Or download the list as a
        text file.
      </p>
    </div>
  );
}
