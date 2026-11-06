import { z } from 'zod';

/**
 * The basket that travels from the Send button to Kroger's `/cart/add`.
 *
 * Kroger silently drops cart lines that carry no fulfilment context, so every
 * line must name a `modality`. Before this existed the basket arrived empty
 * (the "empty cart" bug). Validation lives here, not in the route files,
 * because a Next.js route file may only export route handlers.
 */

export const KROGER_MODALITIES = ['PICKUP', 'DELIVERY'] as const;
export type KrogerModality = (typeof KROGER_MODALITIES)[number];

/** v1 has no toggle, and pickup is the safer default for a store-specific basket. */
export const DEFAULT_MODALITY: KrogerModality = 'PICKUP';

export interface KrogerCartLine {
  upc: string;
  quantity: number;
  modality: KrogerModality;
}

const ModalitySchema = z.enum(KROGER_MODALITIES);

/** Body of POST /api/kroger/authorize. `modality` is optional and defaults to PICKUP. */
export const KrogerHandoffSchema = z.object({
  items: z
    .array(
      z.object({
        // Kroger UPCs are numeric strings; keep it loose but bounded.
        upc: z.string().min(1).max(32),
        quantity: z.number().int().min(1).max(99).default(1),
      }),
    )
    .min(1, 'Nothing to send to Kroger.')
    .max(50, 'Too many items for one handoff.'),
  modality: ModalitySchema.default(DEFAULT_MODALITY),
});

export type KrogerHandoff = z.infer<typeof KrogerHandoffSchema>;

/** One line per item, each carrying the basket's fulfilment choice. */
export function toCartLines(handoff: KrogerHandoff): KrogerCartLine[] {
  return handoff.items.map((item) => ({
    upc: item.upc,
    quantity: item.quantity,
    modality: handoff.modality,
  }));
}

const PendingLineSchema = z.object({
  upc: z.string().min(1).max(32),
  quantity: z.number().int().min(1).max(99),
  // Cookies written before this fix have no modality; treat them as pickup.
  modality: ModalitySchema.default(DEFAULT_MODALITY),
});

/**
 * Reads the pending-cart cookie written by /api/kroger/authorize. Lines that
 * don't validate are dropped, and an invalid modality drops its line rather
 * than being sent to Kroger. Returns null when nothing usable is left.
 */
export function parsePendingCart(raw: string | undefined): KrogerCartLine[] | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const lines = parsed.flatMap((entry) => {
    const line = PendingLineSchema.safeParse(entry);
    return line.success ? [line.data] : [];
  });
  return lines.length > 0 ? lines : null;
}

/** The `/cart/add` request body. */
export function cartAddBody(lines: KrogerCartLine[]): { items: KrogerCartLine[] } {
  return {
    items: lines.map(({ upc, quantity, modality }) => ({ upc, quantity, modality })),
  };
}
