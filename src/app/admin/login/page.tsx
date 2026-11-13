import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireAdminFlag } from '@/lib/admin/guard';
import { getUser } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin/auth';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { AdminLoginForm } from './AdminLoginForm';
import { AdminSignOutButton } from '../AdminSignOutButton';

export default async function AdminLoginPage() {
  requireAdminFlag();

  const user = await getUser();
  if (user?.email && isAdminEmail(user.email)) {
    redirect('/admin');
  }

  const supabaseReady = isSupabaseConfigured();

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-6">
      <h1 className="text-xl font-bold">Admin sign-in</h1>

      {!supabaseReady ? (
        <p className="mt-4 rounded-lg border border-score-mid bg-score-mid-soft p-3 text-sm text-score-mid">
          Accounts are not configured on this deployment. Set the Supabase env vars
          to enable sign-in.
        </p>
      ) : user?.email ? (
        <div className="mt-4 space-y-3">
          <p className="rounded-lg border border-score-mid bg-score-mid-soft p-3 text-sm text-score-mid">
            You’re signed in as <span className="font-medium">{user.email}</span>, but
            that address isn’t on the admin allowlist. Sign out and try a different
            email, or ask an existing admin to add you.
          </p>
          <div className="flex items-center gap-3">
            <AdminSignOutButton />
            <Link href="/" className="text-xs text-muted hover:text-brand">
              Back to app
            </Link>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">
            Enter the email on the admin allowlist. We’ll send a sign-in link.
          </p>
          <div className="mt-4">
            <AdminLoginForm />
          </div>
        </>
      )}
    </div>
  );
}
