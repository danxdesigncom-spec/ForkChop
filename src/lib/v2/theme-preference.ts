'use client';

/**
 * useTheme(): the v2 Appearance switch (System / Light / Dark).
 *
 * The choice lives in the `fc-theme` cookie so the server renders the right
 * `data-theme` on first paint, with no flash. When signed in it is mirrored to
 * `profiles.theme` (migration 0005). The profile row already exists and has
 * owner-only update RLS, so this only ever updates, never inserts.
 *
 * Only meaningful when the redesign flag is on: v1's globals.css ignores
 * `data-theme`, so the switch must not be shown with the flag off.
 */

import { useCallback, useSyncExternalStore } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  THEME_COOKIE,
  parseThemePreference,
  serializeThemeCookie,
  themeAttribute,
  type ThemePreference,
} from './theme-cookie';

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readCookie(): ThemePreference {
  const match = document.cookie
    .split('; ')
    .find((part) => part.startsWith(`${THEME_COOKIE}=`));
  return parseThemePreference(match?.slice(THEME_COOKIE.length + 1));
}

/** Applies the preference to <html> straight away, without a reload. */
function applyToDocument(preference: ThemePreference): void {
  const root = document.documentElement;
  const attr = themeAttribute(preference);
  if (attr) root.dataset.theme = attr;
  else delete root.dataset.theme;
}

async function mirrorToProfile(preference: ThemePreference): Promise<void> {
  const supabase = createClient();
  if (!supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('profiles').update({ theme: preference }).eq('id', user.id);
}

export function useTheme(): {
  theme: ThemePreference;
  setTheme: (next: ThemePreference) => void;
} {
  const theme = useSyncExternalStore(subscribe, readCookie, () => 'system' as const);

  const setTheme = useCallback((next: ThemePreference) => {
    document.cookie = serializeThemeCookie(next);
    applyToDocument(next);
    for (const listener of listeners) listener();
    // Best effort: the cookie is the source of truth for rendering.
    void mirrorToProfile(next).catch(() => {});
  }, []);

  return { theme, setTheme };
}
