/**
 * Types for deep dive Excel export configuration.
 *
 * - HypothesisEntry  — a single hypothesis label + description
 * - SystemHypotheses — all hypotheses for one system
 * - HypothesesData   — the full hypotheses.json shape
 */

export interface HypothesisEntry {
	/** Short label, e.g. "H1" */
	id: string;
	/** Full hypothesis description text */
	description: string;
}

export interface SystemHypotheses {
	/** Matches system.id in reference.json (e.g. "food_systems") */
	systemId: string;
	/** Human-readable system label for the hypothesis table header */
	systemLabel: string;
	/** Ordered list of hypotheses — length drives the per-system column count */
	hypotheses: HypothesisEntry[];
}

/** Shape of static/data/hypotheses.json */
export type HypothesesData = SystemHypotheses[];

// ── Layout constants ──────────────────────────────────────────────────────────

/**
 * Fixed columns that appear on every system sheet regardless of hypothesis count.
 * Metric ID | Indicator | Metric | Value | Flag | AN Threshold | Direction
 * (Comment is always last, added separately)
 */
export const FIXED_COLS_BEFORE_HYPOTHESES = 7;

/** Width of each hypothesis column (H1, H2, …) */
export const HYPOTHESIS_COL_WIDTH = 16;

/** Width of the trailing Comment column */
export const COMMENT_COL_WIDTH = 28;

/** Fixed column widths for the first 7 columns */
export const FIXED_COL_WIDTHS = [10, 36, 22, 10, 14, 16, 12] as const;

/**
 * Compute total column count for a given number of hypotheses.
 * = 7 fixed + N hypothesis columns + 1 comment column
 */
export function colCount(hypothesesCount: number): number {
	return FIXED_COLS_BEFORE_HYPOTHESES + hypothesesCount + 1;
}

/**
 * Compute the full column-widths array for a given number of hypotheses.
 */
export function colWidths(hypothesesCount: number): number[] {
	return [
		...FIXED_COL_WIDTHS,
		...Array(hypothesesCount).fill(HYPOTHESIS_COL_WIDTH),
		COMMENT_COL_WIDTH
	];
}

/**
 * Build the TABLE_HEADERS array for a given list of hypothesis ids.
 */
export function tableHeaders(hypothesisIds: string[]): string[] {
	return [
		'Metric ID',
		'Indicator',
		'Metric',
		'Value',
		'Flag',
		'AN Threshold',
		'Direction',
		...hypothesisIds,
		'Comment'
	];
}
