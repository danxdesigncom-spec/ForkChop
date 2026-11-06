'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * One polite live region for the page. `announce` is debounced (400 ms by
 * default) so fast typing or tapping only reads out the latest message.
 */
export function useAnnouncer(delay = 400) {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announce = useCallback(
    (next: string) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setMessage(next), delay);
    },
    [delay],
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { message, announce };
}
