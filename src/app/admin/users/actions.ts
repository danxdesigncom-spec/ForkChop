'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import { requireAdmin } from '@/lib/admin/guard';
import { createAdminClient, ADMIN_SUPABASE_SETUP_HINT } from '@/lib/supabase/admin';
import { resolveSiteOrigin } from '@/lib/site-url';

export interface ActionResult {
  ok: boolean;
  message: string;
}

const EmailSchema = z
  .string()
  .trim()
  .min(1, 'Enter an email address.')
  .email('That doesn’t look like an email address.')
  .max(254);

const IdSchema = z.string().uuid('Invalid user id.');

/**
 * All four actions repeat the same shape: verify the caller is still an admin
 * (defence in depth against a hostile client bypassing the UI), open the
 * service-role client, do the one supabase call, then revalidate the users
 * page so the list refreshes.
 */

async function withAdminClient<T>(
  work: (client: NonNullable<ReturnType<typeof createAdminClient>>) => Promise<T>,
): Promise<T | { ok: false; message: string }> {
  await requireAdmin();
  const client = createAdminClient();
  if (!client) return { ok: false, message: ADMIN_SUPABASE_SETUP_HINT };
  return work(client);
}

/** Emails a fresh magic sign-in link — same flow the app already uses. */
export async function sendSignInLink(email: string): Promise<ActionResult> {
  const parsed = EmailSchema.safeParse(email);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid email.' };
  }

  const result = await withAdminClient(async (admin) => {
    const origin = resolveSiteOrigin(await headers());
    const { error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: parsed.data,
      options: { redirectTo: `${origin}/auth/callback` },
    });
    if (error) return { ok: false as const, message: error.message };
    return { ok: true as const, message: `Sign-in link emailed to ${parsed.data}.` };
  });
  return result;
}

/** Invites a new user by email. Supabase creates the auth row + sends welcome. */
export async function createUser(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = EmailSchema.safeParse(formData.get('email'));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid email.' };
  }

  const result = await withAdminClient(async (admin) => {
    const origin = resolveSiteOrigin(await headers());
    const { error } = await admin.auth.admin.inviteUserByEmail(parsed.data, {
      redirectTo: `${origin}/auth/callback`,
    });
    if (error) return { ok: false as const, message: error.message };
    revalidatePath('/admin/users');
    return { ok: true as const, message: `Invited ${parsed.data}.` };
  });
  return result;
}

/**
 * Disable a user. Supabase's admin API bans on a duration; 100 years is the
 * accepted "indefinite" value and is trivially reversible via `enableUser`.
 */
export async function disableUser(userId: string): Promise<ActionResult> {
  const parsed = IdSchema.safeParse(userId);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid id.' };

  const result = await withAdminClient(async (admin) => {
    const { error } = await admin.auth.admin.updateUserById(parsed.data, { ban_duration: '876000h' });
    if (error) return { ok: false as const, message: error.message };
    revalidatePath('/admin/users');
    return { ok: true as const, message: 'User disabled.' };
  });
  return result;
}

export async function enableUser(userId: string): Promise<ActionResult> {
  const parsed = IdSchema.safeParse(userId);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid id.' };

  const result = await withAdminClient(async (admin) => {
    const { error } = await admin.auth.admin.updateUserById(parsed.data, { ban_duration: 'none' });
    if (error) return { ok: false as const, message: error.message };
    revalidatePath('/admin/users');
    return { ok: true as const, message: 'User enabled.' };
  });
  return result;
}
