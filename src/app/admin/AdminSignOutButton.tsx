'use client';

import { useTransition } from 'react';
import { signOut } from '@/app/auth/actions';

export function AdminSignOutButton() {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-muted disabled:opacity-50"
      disabled={pending}
      onClick={() => startTransition(() => signOut())}
    >
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
