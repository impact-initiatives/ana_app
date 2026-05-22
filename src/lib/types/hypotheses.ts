/**
 * Hypothesis block types and Zod schemas for static/data/hypotheses.json.
 *
 * Keeping the Zod schema here (typed as ZodType<T>) ensures that any change
 * to the TypeScript interface immediately causes a compile error in the
 * validator script if the schema is out of sync.
 */

import { z } from 'zod';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface HypothesisEntry {
	/** Short label, e.g. "H1" */
	id: string;
	/** Full hypothesis description text */
	description: string;
}

export interface HypothesesBlock {
	/** Identifier — matches system.id in reference.json for system blocks, or a custom slug for non-system blocks */
	hypothesesId: string;
	/** Human-readable label for the hypothesis table header */
	hypothesesLabel: string;
	/** Ordered list of hypotheses — length drives the per-block column count */
	hypotheses: HypothesisEntry[];
	/** Optional hex colour (#rrggbb) for non-system blocks. System blocks use the system palette instead. */
	colorHex?: string;
}

/** Shape of static/data/hypotheses.json */
export type HypothesesData = HypothesesBlock[];

// ── Zod schemas ───────────────────────────────────────────────────────────────
// Typed as ZodType<T> so TypeScript enforces that the schema matches the
// interface — a field mismatch here is a compile error, not a silent runtime bug.

export const HypothesisEntrySchema: z.ZodType<HypothesisEntry> = z
	.object({
		id: z.string().min(1, { message: 'id must be a non-empty string' }),
		description: z.string().min(1, { message: 'description must be a non-empty string' })
	})
	.strict();

export const HypothesesBlockSchema: z.ZodType<HypothesesBlock> = z
	.object({
		hypothesesId: z.string().min(1, { message: 'hypothesesId must be a non-empty string' }),
		hypothesesLabel: z.string().min(1, { message: 'hypothesesLabel must be a non-empty string' }),
		hypotheses: z.array(HypothesisEntrySchema),
		colorHex: z
			.string()
			.regex(/^#[0-9a-fA-F]{6}$/, { message: 'colorHex must be a 6-digit hex colour (#rrggbb)' })
			.optional()
	})
	.strict();

export const HypothesesDataSchema: z.ZodType<HypothesesData> = z.array(HypothesesBlockSchema);
