import { notFound, redirect } from 'next/navigation';
import { getUser } from '@/lib/supabase/server';
import { getFlags } from '@/lib/flags';
import { isAdminEmail } from './auth';

/**
 * Enforce the two conditions every /admin page relies on: the feature flag is
 * on, and the signed-in user is an admin.
 *
 * Flag off → notFound. The admin surface is hidden entirely, not just gated.
 * A visitor should not be able to tell the routes exist.
 *
 * Signed out or not an admin → redirect to /admin/login. The login page
 * itself calls a lighter variant that only checks the flag.
 */
export async function requireAdmin(): Promise<{ email: string }> {
  if (!getFlags().admin) notFound();

  const user = await getUser();
  if (!user?.email || !isAdminEmail(user.email)) {
    redirect('/admin/login');
  }
  return { email: user.email };
}

/** For pages that render even when signed out (the login page itself). */
export function requireAdminFlag(): void {
  if (!getFlags().admin) notFound();
}
