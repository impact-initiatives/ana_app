/**
 * Layout constants and helpers for deep dive Excel export.
 *
 * Hypothesis block types live in hypotheses.ts — import from there.
 */

export type { HypothesisEntry, HypothesesBlock, HypothesesData } from './hypotheses';

// ── Layout constants ──────────────────────────────────────────────────────────

/**
 * Fixed columns per indicator row:
 * Metric ID | Factor - Sub-factor | Evidence type | Metric | Value | Flag | AN Threshold | VAN Threshold
 */
export const FIXED_COLS_BEFORE_HYPOTHESES = 8;

/** Width of each hypothesis column (H1, H2, …) */
export const HYPOTHESIS_COL_WIDTH = 8;

/** Width of the trailing Comments column */
export const COMMENT_COL_WIDTH = 32;

/** Fixed column widths for the first 8 columns */
export const FIXED_COL_WIDTHS = [46, 20, 10, 64, 10, 16, 10, 10] as const;

/**
 * Compute total column count for a given number of hypotheses.
 * = 8 fixed + N hypothesis columns + 1 comments column
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
		'Factor - Sub-factor',
		'Evidence type',
		'Metric ID',
		'Metric',
		'Value',
		'Flag',
		'AN Threshold',
		'VAN Threshold',
		...hypothesisIds,
		'Comments'
	];
}
