/**
 * Canonical flag vocabularies for the ANA pipeline.
 *
 * FlagStatus — used at every rollup level (metric → subfactor → factor → system).
 * PriorityFlag — the final per-UoA classification produced by the ANA decision tree.
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

// ── Priority classification (per-UoA) ────────────────────────────────────────

export type PriorityFlag =
	| 'em'
	| 'ho_primary'
	| 'ho_secondary'
	| 'an_primary'
	| 'an_secondary'
	| 'insufficient_evidence'
	| 'no_data'
	| 'no_acute_needs';

/** Canonical iteration order for PriorityFlag — severity descending. */
export const PRIORITY_FLAG_KEYS = [
	'em',
	'ho_primary',
	'ho_secondary',
	'an_primary',
	'an_secondary',
	'insufficient_evidence',
	'no_acute_needs',
	'no_data'
] as const satisfies readonly PriorityFlag[];

/** PriorityFlag values that represent confirmed acute needs requiring prioritisation. */
export const ACUTE_PRIORITY_FLAGS = new Set<PriorityFlag>([
	'em',
	'ho_primary',
	'ho_secondary',
	'an_primary',
	'an_secondary'
]);

/** Severity order for sorting — lower index = higher severity. Derived from PRIORITY_FLAG_KEYS. */
export const PRIORITY_ORDER = Object.fromEntries(
	PRIORITY_FLAG_KEYS.map((k, i) => [k, i])
) as Record<PriorityFlag, number>;

// ── Conclusion classification (deep-dive merge) ───────────────────────────────

export type ConclusionKey =
	| 'roem'
	| 'an_exclamation'
	| 'an'
	| 'no_acute_needs'
	| 'insufficient_evidence'
	| 'no_data';

/** Canonical iteration order — severity descending. */
export const CONCLUSION_KEYS = [
	'roem',
	'an_exclamation',
	'an',
	'no_acute_needs',
	'insufficient_evidence',
	'no_data'
] as const satisfies readonly ConclusionKey[];
