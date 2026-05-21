/**
 * Layout constants and helpers for deep dive Excel export.
 *
 * Hypothesis block types live in hypotheses.ts — import from there.
 */

export type { HypothesisEntry, HypothesesBlock, HypothesesData } from './hypotheses';

// ── Layout constants ──────────────────────────────────────────────────────────

/**
 * Fixed columns per indicator row:
 * [gutter] | Factor - Sub-factor | Evidence type | Metric ID | Metric | Value | Flag | AN Threshold | VAN Threshold
 * Col 1 (narrow gutter) merges with col 2 for all data rows; used standalone for legend/hypothesis IDs.
 */
export const FIXED_COLS_BEFORE_HYPOTHESES = 9;

/** Width of each hypothesis column (H1, H2, …) */
export const HYPOTHESIS_COL_WIDTH = 8;

/** Width of the trailing Comments column */
export const COMMENT_COL_WIDTH = 32;

/** Fixed column widths for the first 9 columns (gutter + 8 data cols) */
export const FIXED_COL_WIDTHS = [9, 35, 20, 10, 64, 10, 16, 10, 10] as const;

/**
 * Compute total column count for a given number of hypotheses.
 * = 9 fixed + N hypothesis columns + 1 comments column
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
		'Factor - Sub-factor', // col 1 — start of gutter+label merge
		'',                    // col 2 — merged into col 1
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
