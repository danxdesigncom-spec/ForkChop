'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { describeAuthError } from '@/lib/auth-errors';
import { resolveSiteOrigin } from '@/lib/site-url';

/**
 * Sign-in and sign-out.
 *
 * Server Actions rather than route handlers so the email never travels through
 * client-side state, and so the auth cookies are written by the framework.
 */

export interface AuthResult {
  ok: boolean;
  message: string;
}

const EmailSchema = z
  .string()
  .trim()
  .min(1, 'Enter your email address.')
  .email("That doesn't look like an email address.")
  .max(254);

/**
 * See src/lib/site-url.ts for the full rationale — the short version is:
 * pinning to NEXT_PUBLIC_SITE_URL in Production stops magic links from
 * landing on preview URLs that Vercel Deployment Protection guards.
 */
async function resolveOrigin(): Promise<string> {
  return resolveSiteOrigin(await headers());
}

/** Emails a magic link. Passwordless — no password is ever set or stored. */
export async function signInWithEmail(_prev: AuthResult | null, formData: FormData): Promise<AuthResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: 'Accounts are not configured on this deployment yet.' };
  }

  const parsed = EmailSchema.safeParse(formData.get('email'));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Enter a valid email address.' };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { ok: false, message: 'Accounts are not configured on this deployment yet.' };
  }

  const origin = await resolveOrigin();

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      shouldCreateUser: true,
    },
  });

  if (error) {
    return { ok: false, message: describeAuthError(error.message) };
  }

  return {
    ok: true,
    message: `Check ${parsed.data} for a sign-in link. It expires in an hour.`,
  };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  revalidatePath('/', 'layout');
}
