import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireAdminFlag } from '@/lib/admin/guard';
import { getUser } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin/auth';
import { AdminSignOutButton } from './AdminSignOutButton';

/**
 * Every /admin route hides behind the flag first, so a request to any of them
 * — including the login page — returns 404 when the surface is disabled.
 * Auth is enforced per-page (via `requireAdmin`) so the login page itself
 * can render without redirecting to itself.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  requireAdminFlag();

  const user = await getUser();
  const signedInAsAdmin = isAdminEmail(user?.email);

  return (
    <div className="min-h-screen bg-surface-muted">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="text-sm font-bold uppercase tracking-wide text-brand">
              ForkChop admin
            </Link>
            {signedInAsAdmin && (
              <nav aria-label="Admin sections" className="flex items-center gap-4 text-sm">
                <Link href="/admin/users" className="text-muted hover:text-brand">
                  Users
                </Link>
                <Link href="/admin/recipes" className="text-muted hover:text-brand">
                  Recipes
                </Link>
              </nav>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted">
            <Link href="/" className="hover:text-brand">
              ← Back to app
            </Link>
            {user?.email && (
              <>
                <span aria-hidden>·</span>
                <span>{user.email}</span>
                <AdminSignOutButton />
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}
