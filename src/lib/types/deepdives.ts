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
export const HYPOTHESIS_COL_WIDTH = 10;

/** Width of the trailing Comments column */
export const COMMENT_COL_WIDTH = 32;

/** Fixed column widths for the first 9 columns (gutter + 8 data cols) */
export const FIXED_COL_WIDTHS = [9, 28, 16, 8, 64, 10, 12, 8, 8] as const;

/** Headers for the trailing source metadata columns */
export const SOURCE_COL_HEADERS = [
	'Source',
	'Source link',
	'Start of data collection',
	'End of data collection'
] as const;

/** Widths for the trailing source metadata columns */
export const SOURCE_COL_WIDTHS = [28, 24, 20, 20] as const;

/**
 * Compute total column count for a given number of hypotheses.
 * = 9 fixed + N hypothesis columns + 1 comments column + 4 source columns
 */
export function colCount(hypothesesCount: number): number {
	return FIXED_COLS_BEFORE_HYPOTHESES + hypothesesCount + 1 + SOURCE_COL_HEADERS.length;
}

/**
 * Compute the full column-widths array for a given number of hypotheses.
 */
export function colWidths(hypothesesCount: number): number[] {
	return [
		...FIXED_COL_WIDTHS,
		...Array(hypothesesCount).fill(HYPOTHESIS_COL_WIDTH),
		COMMENT_COL_WIDTH,
		...SOURCE_COL_WIDTHS
	];
}

// ── Dropdown value constants (shared by generator and merge parser) ───────────

export const HYPOTHESIS_VALUES             = ['H1', 'H2', 'H3', 'Inconclusive'] as const;
export const INDICATOR_RATING_VALUES       = ['++', '+', '+/-', '-', '--'] as const;
export const PLAUSIBILITY_INDICATOR_VALUES = ['Very likely', 'Likely', 'Plausible', 'Unlikely', 'Very unlikely'] as const;
export const PLAUSIBILITY_SYNTHESIS_VALUES = [...PLAUSIBILITY_INDICATOR_VALUES, 'Inconclusive'] as const;
export const TRIANGULATION_VALUES          = ['Strong', 'Moderate', 'Weak'] as const;
export const CONCLUSION_VALUES             = ['RoEM', 'Acute Needs (!)', 'Acute Needs', 'No Acute Needs', 'Insufficient evidence', 'No data'] as const;

/** Produce an Excel data-validation formulae string: `"H1,H2,H3,Inconclusive"` */
export function toExcelList(values: readonly string[]): string {
	return `"${values.join(',')}"`;
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
		'AN Th.',
		'VAN Th.',
		...hypothesisIds,
		'Comments',
		...SOURCE_COL_HEADERS
	];
}
