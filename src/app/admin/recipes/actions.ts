'use server';

import { z } from 'zod';
import { requireAdmin } from '@/lib/admin/guard';

export interface ActionResult {
  ok: boolean;
  message: string;
}

/**
 * Recipe admin actions — SHELL.
 *
 * The corpus is currently baked in from `src/lib/db/data/recipes.ts` and
 * seeded into SQLite at build time, so persisting a "disabled" flag or a
 * newly imported recipe requires either a Supabase table or a rebuild-time
 * change to the seed. That schema decision deserves its own PR.
 *
 * Until then, these actions do the real validation work and return a clear
 * message about what's persisted vs. what still needs the follow-up. The
 * shape of every action matches the users page, so wiring the persistence
 * later touches only the body, not the callers.
 */

const SlugSchema = z.string().min(1).max(200);

const ImportRecipeSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(''),
  cuisine: z.string().default(''),
  servings: z.number().int().positive().default(2),
  prepMinutes: z.number().int().nonnegative().default(0),
  cookMinutes: z.number().int().nonnegative().default(0),
  emoji: z.string().default('🍽️'),
  tags: z.array(z.string()).default([]),
  instructions: z.array(z.string()).default([]),
  ingredients: z
    .array(
      z.object({
        id: z.string(),
        quantity: z.number().nullable().optional(),
        unit: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
        importance: z.enum(['required', 'optional']).default('required'),
      }),
    )
    .default([]),
});

const ImportPayloadSchema = z.union([
  ImportRecipeSchema,
  z.array(ImportRecipeSchema),
]);

export async function toggleRecipeDisabled(slug: string, disable: boolean): Promise<ActionResult> {
  await requireAdmin();
  const parsed = SlugSchema.safeParse(slug);
  if (!parsed.success) return { ok: false, message: 'Invalid slug.' };

  return {
    ok: true,
    message: `${disable ? 'Disable' : 'Enable'} request for “${parsed.data}” accepted. Persistence lands in the follow-up PR.`,
  };
}

export async function importRecipesJson(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: 'Choose a JSON file to import.' };
  }
  if (file.size > 2_000_000) {
    return { ok: false, message: 'File too large (2MB limit for the shell).' };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    return { ok: false, message: 'Could not parse as JSON.' };
  }

  const parsed = ImportPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, message: `Invalid payload: ${parsed.error.issues[0]?.message ?? 'schema mismatch'}` };
  }

  const count = Array.isArray(parsed.data) ? parsed.data.length : 1;
  return {
    ok: true,
    message: `Validated ${count} recipe${count === 1 ? '' : 's'}. Insertion lands in the follow-up PR.`,
  };
}

export async function fetchFromSpoonacular(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const raw = formData.get('query');
  const query = typeof raw === 'string' ? raw.trim() : '';
  if (!query) return { ok: false, message: 'Enter a search term.' };

  return {
    ok: true,
    message: `Would fetch Spoonacular results for “${query}”. Wire-up lands in the follow-up PR.`,
  };
}
