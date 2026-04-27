/**
 * Canonical flag vocabularies for the ANA pipeline.
 *
 * FlagStatus — used at every rollup level (metric → subfactor → factor → system).
 * PrelimFlag — the final per-UoA classification produced by the ANA decision tree.
 *
 * Both share the two lowest-severity values ('no_data', 'insufficient_evidence')
 * as identical strings so status comparisons work across both types.
 */

// ── Metric / subfactor / factor / system level ────────────────────────────────

export type FlagStatus = 'flag' | 'no_flag' | 'insufficient_evidence' | 'no_data';

/** Canonical iteration order for FlagStatus — drives legend, chart, and filter ordering. */
export const FLAG_STATUS_KEYS = [
	'flag',
	'no_flag',
	'insufficient_evidence',
	'no_data'
] as const satisfies readonly FlagStatus[];

// ── Preliminary classification (per-UoA) ─────────────────────────────────────

export type PrelimFlag =
	| 'em'
	| 'roem'
	| 'acute'
	| 'acute_needs'
	| 'insufficient_evidence'
	| 'no_data';

/** Canonical iteration order for PrelimFlag — severity descending. */
export const PRELIM_FLAG_KEYS = [
	'em',
	'roem',
	'acute',
	'acute_needs',
	'insufficient_evidence',
	'no_data'
] as const satisfies readonly PrelimFlag[];

/** PrelimFlag values that represent confirmed acute needs. */
export const ACUTE_PRELIM_FLAGS = new Set<PrelimFlag>(['em', 'roem', 'acute']);
