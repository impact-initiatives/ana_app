/**
 * referenceValidator.ts
 *
 * Browser-safe post-merge validation for reference.json.
 * Single source of truth — imported by both:
 *   - src/lib/engine/referenceMerger.ts  (browser post-merge validation)
 *   - scripts/validate-reference-json.ts (CLI build-time validation)
 *
 * Passes implemented:
 *   2 — Factor/subfactor ID validity (uses generated enums; same data source as CSVs)
 *   3 — Required system IDs
 *   4 — Threshold values (null/undefined → warning; ≤ 0 → error)
 *   5 — Duplicate IDs (metric/system/factor/subfactor → error; duplicate labels → warning)
 *   6 — Threshold integers and plausibility
 *   7 — VAN ordering
 *   8 — VAN presence
 *
 * Pass 1 (Zod schema) is handled separately by safeValidateReferenceRoot in reference-json.ts.
 */

import { SystemIDEnum } from '$lib/types/structure';
import { FactorIDs } from '$lib/types/generated/factor-enum';
import { SubFactorIDs } from '$lib/types/generated/subfactor-enum';
import { safeValidateReferenceRoot, formatZodErrors } from '$lib/types/reference-json';

// ── Shared loose traversal types ──────────────────────────────────────────────

type MetricLike = {
	metric?: string;
	label?: string | null;
	preference?: number;
	factor_threshold?: number | null;
	evidence_threshold?: number | null;
	above_or_below?: string;
	evidence_type?: string | null;
	thresholds?: { an?: number | null; van?: number | null };
};
type IndicatorLike = { id?: string; metrics?: MetricLike[] };
type SubFactorLike = { id?: string; indicators?: IndicatorLike[] };
type FactorLike = { id?: string; sub_factors?: SubFactorLike[] };
type SystemLike = { id?: string; factors?: FactorLike[] };
type RootLike = { systems?: SystemLike[] };

function asRoot(data: unknown): RootLike {
	return (data ?? {}) as RootLike;
}

// ── Pass 2 — Factor/subfactor ID validity ────────────────────────────────────

export interface LookupError {
	location: string;
	kind: 'factor' | 'subfactor';
	id: string;
}

const VALID_FACTOR_IDS = new Set<string>(FactorIDs);
const VALID_SUBFACTOR_IDS = new Set<string>(SubFactorIDs);

/**
 * Pass 2: every factor ID must be in FactorIDEnum; every subfactor ID in SubFactorIDEnum.
 * Both enums are generated at build time from the same CSVs the script previously read at runtime.
 */
export function checkLookupConsistency(data: unknown): LookupError[] {
	const root = asRoot(data);
	const errors: LookupError[] = [];

	for (let si = 0; si < (root.systems?.length ?? 0); si++) {
		const sys = root.systems![si];
		const sysLoc = `systems[${si}]`;

		for (let fi = 0; fi < (sys.factors?.length ?? 0); fi++) {
			const fac = sys.factors![fi];
			const facId = fac.id ?? '';
			const facLoc = `${sysLoc}.factors[${fi}]`;

			if (facId && !VALID_FACTOR_IDS.has(facId)) {
				errors.push({ location: facLoc, kind: 'factor', id: facId });
			}

			for (let sfi = 0; sfi < (fac.sub_factors?.length ?? 0); sfi++) {
				const sf = fac.sub_factors![sfi];
				const sfId = sf.id ?? '';
				const sfLoc = `${facLoc}.sub_factors[${sfi}]`;

				if (sfId && !VALID_SUBFACTOR_IDS.has(sfId)) {
					errors.push({ location: sfLoc, kind: 'subfactor', id: sfId });
				}
			}
		}
	}

	return errors;
}

// ── Pass 3 — Required system IDs ─────────────────────────────────────────────

export interface RequiredSystemError {
	missingId: SystemIDEnum;
}

const REQUIRED_SYSTEM_IDS: SystemIDEnum[] = [SystemIDEnum.Mortality, SystemIDEnum.HealthOutcomes];

/** Pass 3: mortality and health_outcomes must be present. */
export function checkRequiredSystems(data: unknown): RequiredSystemError[] {
	const root = asRoot(data);
	const present = new Set((root.systems ?? []).map((s) => s.id).filter(Boolean));
	return REQUIRED_SYSTEM_IDS.filter((id) => !present.has(id)).map((id) => ({ missingId: id }));
}

// ── Pass 4 — Threshold value sanity ──────────────────────────────────────────

export interface ThresholdValueError {
	location: string;
	metric: string;
	field: 'factor_threshold' | 'evidence_threshold';
	value: number;
}

export interface ThresholdValueWarning {
	location: string;
	metric: string;
	field: 'factor_threshold' | 'evidence_threshold';
}

export interface ThresholdValueResult {
	errors: ThresholdValueError[];
	warnings: ThresholdValueWarning[];
}

/**
 * Pass 4:
 *   - null/undefined threshold → warning (may be intentionally unset)
 *   - value ≤ 0              → error (0 always-flags or always-no_flags)
 */
export function checkThresholdValues(data: unknown): ThresholdValueResult {
	const root = asRoot(data);
	const errors: ThresholdValueError[] = [];
	const warnings: ThresholdValueWarning[] = [];

	for (let si = 0; si < (root.systems?.length ?? 0); si++) {
		for (let fi = 0; fi < (root.systems![si].factors?.length ?? 0); fi++) {
			for (let sfi = 0; sfi < (root.systems![si].factors![fi].sub_factors?.length ?? 0); sfi++) {
				const inds = root.systems![si].factors![fi].sub_factors![sfi].indicators ?? [];
				for (let ii = 0; ii < inds.length; ii++) {
					for (let mi = 0; mi < (inds[ii].metrics?.length ?? 0); mi++) {
						const m = inds[ii].metrics![mi];
						if (m.preference === 3) continue;
						if (m.evidence_type === 'Supporting evidence') continue;
						const loc = `systems[${si}].factors[${fi}].sub_factors[${sfi}].indicators[${ii}].metrics[${mi}]`;

						for (const field of ['factor_threshold', 'evidence_threshold'] as const) {
							const val = m[field];
							if (val == null) {
								warnings.push({ location: loc, metric: m.metric ?? '?', field });
							} else if (val <= 0) {
								errors.push({ location: loc, metric: m.metric ?? '?', field, value: val });
							}
						}
					}
				}
			}
		}
	}

	return { errors, warnings };
}

// ── Pass 5 — Duplicate IDs, invalid IDs, and duplicate labels ────────────────

const METRIC_ID_REGEX = /^MET\d{3,}$/;

export interface DuplicateIDGroup {
	kind: 'metric' | 'system' | 'factor' | 'subfactor' | 'invalid_format';
	id: string;
	locations: string[];
}

export interface DuplicateLabelGroup {
	label: string;
	occurrences: Array<{ location: string; metricId: string }>;
}

export interface DuplicateIDResult {
	errors: DuplicateIDGroup[];
	warnings: DuplicateLabelGroup[];
}

/**
 * Pass 5:
 *   - duplicate metric/system/factor/subfactor IDs → error (all occurrences reported)
 *   - duplicate metric labels                       → warning (all occurrences reported)
 */
export function checkDuplicateIDs(data: unknown): DuplicateIDResult {
	const root = asRoot(data);

	// Collect all occurrences first, then filter to groups with >1 entries
	const metricLocs = new Map<string, string[]>();
	const labelOccurrences = new Map<string, Array<{ location: string; metricId: string }>>();
	const systemLocs = new Map<string, string[]>();

	for (let si = 0; si < (root.systems?.length ?? 0); si++) {
		const sys = root.systems![si];
		const sysId = sys.id ?? '';
		const sysLoc = `systems[${si}]`;

		if (sysId) {
			const list = systemLocs.get(sysId) ?? [];
			list.push(sysLoc);
			systemLocs.set(sysId, list);
		}

		const factorLocs = new Map<string, string[]>();

		for (let fi = 0; fi < (sys.factors?.length ?? 0); fi++) {
			const fac = sys.factors![fi];
			const facId = fac.id ?? '';
			const facLoc = `${sysLoc}.factors[${fi}]`;

			if (facId) {
				const list = factorLocs.get(facId) ?? [];
				list.push(facLoc);
				factorLocs.set(facId, list);
			}

			const subfactorLocs = new Map<string, string[]>();

			for (let sfi = 0; sfi < (fac.sub_factors?.length ?? 0); sfi++) {
				const sf = fac.sub_factors![sfi];
				const sfId = sf.id ?? '';
				const sfLoc = `${facLoc}.sub_factors[${sfi}]`;

				if (sfId) {
					const list = subfactorLocs.get(sfId) ?? [];
					list.push(sfLoc);
					subfactorLocs.set(sfId, list);
				}

				for (let ii = 0; ii < (sf.indicators?.length ?? 0); ii++) {
					const ind = sf.indicators![ii];
					for (let mi = 0; mi < (ind.metrics?.length ?? 0); mi++) {
						const m = ind.metrics![mi];
						const metId = m.metric ?? '';
						const metLoc = `${sfLoc}.indicators[${ii}].metrics[${mi}]`;

						{
							const list = metricLocs.get(metId) ?? [];
							list.push(metLoc);
							metricLocs.set(metId, list);
						}

						const label = (m.label ?? '').trim();
						if (label) {
							const list = labelOccurrences.get(label) ?? [];
							list.push({ location: metLoc, metricId: metId });
							labelOccurrences.set(label, list);
						}
					}
				}
			}

			// Emit duplicate subfactor errors (scoped within this factor)
			// (collected inline above; emitted after factor loop below)
			for (const [id, locs] of subfactorLocs) {
				if (locs.length > 1) {
					// will be added to errors below — store for now
					subfactorLocs.set(id, locs);
				}
			}
		}

		// Emit duplicate factor errors per system (scoped within system)
		for (const [id, locs] of factorLocs) {
			if (locs.length > 1) {
				factorLocs.set(id, locs);
			}
		}
	}

	const errors: DuplicateIDGroup[] = [];

	for (const [id, locs] of systemLocs) {
		if (locs.length > 1) errors.push({ kind: 'system', id, locations: locs });
	}

	// Re-traverse to emit factor/subfactor duplicates with correct scoping
	for (let si = 0; si < (root.systems?.length ?? 0); si++) {
		const sys = root.systems![si];
		const sysLoc = `systems[${si}]`;
		const factorLocs = new Map<string, string[]>();

		for (let fi = 0; fi < (sys.factors?.length ?? 0); fi++) {
			const fac = sys.factors![fi];
			const facId = fac.id ?? '';
			const facLoc = `${sysLoc}.factors[${fi}]`;
			if (facId) {
				const list = factorLocs.get(facId) ?? [];
				list.push(facLoc);
				factorLocs.set(facId, list);
			}

			const subfactorLocs = new Map<string, string[]>();
			for (let sfi = 0; sfi < (fac.sub_factors?.length ?? 0); sfi++) {
				const sf = fac.sub_factors![sfi];
				const sfId = sf.id ?? '';
				const sfLoc = `${facLoc}.sub_factors[${sfi}]`;
				if (sfId) {
					const list = subfactorLocs.get(sfId) ?? [];
					list.push(sfLoc);
					subfactorLocs.set(sfId, list);
				}
			}
			for (const [id, locs] of subfactorLocs) {
				if (locs.length > 1) errors.push({ kind: 'subfactor', id, locations: locs });
			}
		}
		for (const [id, locs] of factorLocs) {
			if (locs.length > 1) errors.push({ kind: 'factor', id, locations: locs });
		}
	}

	for (const [id, locs] of metricLocs) {
		if (!METRIC_ID_REGEX.test(id)) {
			for (const loc of locs) {
				errors.push({ kind: 'invalid_format', id, locations: [loc] });
			}
		} else if (locs.length > 1) {
			errors.push({ kind: 'metric', id, locations: locs });
		}
	}

	const warnings: DuplicateLabelGroup[] = [];
	for (const [label, occurrences] of labelOccurrences) {
		if (occurrences.length > 1) warnings.push({ label, occurrences });
	}

	return { errors, warnings };
}

// ── Pass 6 — Threshold integers and plausibility ──────────────────────────────

export interface ThresholdIntegerError {
	location: string;
	metric: string;
	field: 'factor_threshold' | 'evidence_threshold';
	value: number;
}

export interface ThresholdPlausibilityError {
	location: string;
	kind: 'factor_threshold' | 'evidence_threshold';
	value: number;
	groupSize: number;
	groupKey: string;
}

/** Pass 6a: factor_threshold and evidence_threshold must be integers. */
export function checkThresholdIntegers(data: unknown): ThresholdIntegerError[] {
	const root = asRoot(data);
	const errors: ThresholdIntegerError[] = [];

	for (let si = 0; si < (root.systems?.length ?? 0); si++) {
		for (let fi = 0; fi < (root.systems![si].factors?.length ?? 0); fi++) {
			for (let sfi = 0; sfi < (root.systems![si].factors![fi].sub_factors?.length ?? 0); sfi++) {
				const inds = root.systems![si].factors![fi].sub_factors![sfi].indicators ?? [];
				for (let ii = 0; ii < inds.length; ii++) {
					for (let mi = 0; mi < (inds[ii].metrics?.length ?? 0); mi++) {
						const m = inds[ii].metrics![mi];
						if (m.preference === 3) continue;
						if (m.evidence_type === 'Supporting evidence') continue;
						const loc = `systems[${si}].factors[${fi}].sub_factors[${sfi}].indicators[${ii}].metrics[${mi}]`;

						for (const field of ['factor_threshold', 'evidence_threshold'] as const) {
							const val = m[field];
							if (typeof val === 'number' && !Number.isInteger(val)) {
								errors.push({ location: loc, metric: m.metric ?? '?', field, value: val });
							}
						}
					}
				}
			}
		}
	}

	return errors;
}

/**
 * Pass 6b: within each (factor_threshold, evidence_threshold) group in a subfactor,
 * neither threshold may exceed the group size.
 */
export function checkThresholdPlausibility(data: unknown): ThresholdPlausibilityError[] {
	const root = asRoot(data);
	const errors: ThresholdPlausibilityError[] = [];

	for (let si = 0; si < (root.systems?.length ?? 0); si++) {
		for (let fi = 0; fi < (root.systems![si].factors?.length ?? 0); fi++) {
			for (let sfi = 0; sfi < (root.systems![si].factors![fi].sub_factors?.length ?? 0); sfi++) {
				const sf = root.systems![si].factors![fi].sub_factors![sfi];
				const sfLoc = `systems[${si}].factors[${fi}].sub_factors[${sfi}]`;
				const groups = new Map<string, { ft: number; et: number; count: number }>();

				for (const ind of sf.indicators ?? []) {
					for (const m of ind.metrics ?? []) {
						if (m.preference === 3) continue;
						if (m.evidence_type === 'Supporting evidence') continue;
						const ft = m.factor_threshold;
						const et = m.evidence_threshold;
						if (typeof ft === 'number' && typeof et === 'number') {
							const key = `ft=${ft},et=${et}`;
							const g = groups.get(key);
							if (g) g.count++;
							else groups.set(key, { ft, et, count: 1 });
						}
					}
				}

				for (const [key, { ft, et, count }] of groups) {
					if (ft > count) {
						errors.push({ location: sfLoc, kind: 'factor_threshold', value: ft, groupSize: count, groupKey: key });
					}
					if (et > count) {
						errors.push({ location: sfLoc, kind: 'evidence_threshold', value: et, groupSize: count, groupKey: key });
					}
				}
			}
		}
	}

	return errors;
}

// ── Pass 7 — VAN ordering ─────────────────────────────────────────────────────

export interface VanOrderError {
	location: string;
	metric: string;
	above_or_below: string;
	an: number;
	van: number;
}

/** Pass 7: VAN must not be less extreme than AN (equal is allowed — means no distinct VAN level). */
export function checkVanOrdering(data: unknown): VanOrderError[] {
	const root = asRoot(data);
	const errors: VanOrderError[] = [];

	for (let si = 0; si < (root.systems?.length ?? 0); si++) {
		for (let fi = 0; fi < (root.systems![si].factors?.length ?? 0); fi++) {
			for (let sfi = 0; sfi < (root.systems![si].factors![fi].sub_factors?.length ?? 0); sfi++) {
				const inds = root.systems![si].factors![fi].sub_factors![sfi].indicators ?? [];
				for (let ii = 0; ii < inds.length; ii++) {
					for (let mi = 0; mi < (inds[ii].metrics?.length ?? 0); mi++) {
						const m = inds[ii].metrics![mi];
						const an = m.thresholds?.an;
						const van = m.thresholds?.van;
						const dir = m.above_or_below;
						if (typeof an === 'number' && typeof van === 'number' && dir) {
							const valid = dir === 'Above' ? van >= an : van <= an;
							if (!valid) {
								const loc = `systems[${si}].factors[${fi}].sub_factors[${sfi}].indicators[${ii}].metrics[${mi}]`;
								errors.push({ location: loc, metric: m.metric ?? '?', above_or_below: dir, an, van });
							}
						}
					}
				}
			}
		}
	}

	return errors;
}

// ── Pass 8 — VAN presence ─────────────────────────────────────────────────────

export interface VanPresenceError {
	location: string;
	metric: string;
	evidence_type: string;
	above_or_below: string;
	an: number | null;
}

const SUPPORTING_EVIDENCE = 'Supporting evidence';

/** Pass 8: non-supporting-evidence, non-preference-3 metrics must have thresholds.van. */
export function checkVanPresence(data: unknown): VanPresenceError[] {
	const root = asRoot(data);
	const errors: VanPresenceError[] = [];

	for (let si = 0; si < (root.systems?.length ?? 0); si++) {
		for (let fi = 0; fi < (root.systems![si].factors?.length ?? 0); fi++) {
			for (let sfi = 0; sfi < (root.systems![si].factors![fi].sub_factors?.length ?? 0); sfi++) {
				const inds = root.systems![si].factors![fi].sub_factors![sfi].indicators ?? [];
				for (let ii = 0; ii < inds.length; ii++) {
					for (let mi = 0; mi < (inds[ii].metrics?.length ?? 0); mi++) {
						const m = inds[ii].metrics![mi];
						if (m.preference === 3) continue;
						const et = m.evidence_type ?? null;
						if (et === null || et === SUPPORTING_EVIDENCE) continue;
						if (m.thresholds?.van == null) {
							const loc = `systems[${si}].factors[${fi}].sub_factors[${sfi}].indicators[${ii}].metrics[${mi}]`;
							errors.push({
								location: loc,
								metric: m.metric ?? '?',
								evidence_type: et,
								above_or_below: m.above_or_below ?? '?',
								an: m.thresholds?.an ?? null
							});
						}
					}
				}
			}
		}
	}

	return errors;
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

/**
 * Run passes 1–8 on the merged JSON.
 *
 * errors  → block apply / CI failure
 * warnings → shown to user, non-blocking
 */
export function validateMergedJson(data: unknown): { errors: string[]; warnings: string[] } {
	const errors: string[] = [];
	const warnings: string[] = [];

	// Pass 1 — Zod schema
	const zodResult = safeValidateReferenceRoot(data);
	if (!zodResult.success) {
		for (const msg of formatZodErrors(zodResult.error)) {
			errors.push(`[Pass 1] ${msg}`);
		}
	}

	// Pass 2
	for (const e of checkLookupConsistency(data)) {
		errors.push(`[Pass 2] Unknown ${e.kind} ID "${e.id}" at ${e.location}`);
	}

	// Pass 3
	for (const e of checkRequiredSystems(data)) {
		errors.push(`[Pass 3] Required system missing: ${e.missingId}`);
	}

	// Pass 4
	const p4 = checkThresholdValues(data);
	for (const e of p4.errors) {
		errors.push(`[Pass 4] ${e.metric}: ${e.field}=${e.value} (must be ≥ 1)`);
	}
	for (const w of p4.warnings) {
		warnings.push(`[Pass 4] ${w.metric}: ${w.field} is not set`);
	}

	// Pass 5
	const p5 = checkDuplicateIDs(data);
	for (const e of p5.errors) {
		if (e.kind === 'invalid_format') {
			errors.push(`[Pass 5] Invalid metric ID "${e.id}" at ${e.locations[0]} — must match MET followed by 3+ digits (e.g. MET001)`);
		} else {
			errors.push(`[Pass 5] Duplicate ${e.kind} ID "${e.id}": ${e.locations.join(' · ')}`);
		}
	}
	for (const w of p5.warnings) {
		const locs = w.occurrences.map((o) => `${o.metricId} at ${o.location}`).join(' · ');
		errors.push(`[Pass 5] Duplicate metric label "${w.label}": ${locs}`);
	}

	// Pass 6
	for (const e of checkThresholdIntegers(data)) {
		errors.push(`[Pass 6] ${e.metric}: ${e.field}=${e.value} is not an integer`);
	}
	for (const e of checkThresholdPlausibility(data)) {
		errors.push(`[Pass 6] ${e.location}: ${e.kind}=${e.value} exceeds group size ${e.groupSize} (${e.groupKey})`);
	}

	// Pass 7
	for (const e of checkVanOrdering(data)) {
		errors.push(`[Pass 7] ${e.metric} (${e.above_or_below}): van=${e.van} ≤ an=${e.an} — severity scale inverted`);
	}

	// Pass 8
	for (const e of checkVanPresence(data)) {
		errors.push(`[Pass 8] ${e.metric} (${e.evidence_type}): missing thresholds.van`);
	}

	return { errors, warnings };
}
