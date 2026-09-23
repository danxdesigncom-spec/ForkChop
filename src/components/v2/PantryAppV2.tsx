'use client';

import type { ComponentProps } from 'react';
import { PantryApp } from '../PantryApp';

/**
 * v2 entry point, rendered by `page.tsx` when the `redesign` flag is on.
 *
 * An empty shell for now: it takes exactly the same props as `PantryApp` and
 * renders it unchanged, so Preview with the flag on behaves like v1. The v2
 * layout replaces the body in phase 4 (see docs/redesign/04-screens.md).
 */
export function PantryAppV2(props: ComponentProps<typeof PantryApp>) {
  return <PantryApp {...props} />;
}
