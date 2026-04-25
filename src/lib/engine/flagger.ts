import { tidy, mutate } from '@tidyjs/tidy';
import {
	buildSubfactorList,
	getMetricMetadata,
	getAllMetricIds
} from '$lib/engine/metricMetadata';

/**
 * Lightweight, modular flagger
 *
 * - Entry: flagData(items, referenceJson)
 * 
 * Assumes validator has ensured `uoa` exists on every row and metric column names are the canonical IDs used in referenceJson.
 *
 * Implementation notes:
 * - Missing canonical indicator columns are null-padded onto each input row before the mutate pass, so output rows always carry explicit nulls for every canonical id.
 * - Per-metric flags and within-10% computations are generated via makeMetricSpec.
 *   Preference-3 metrics are excluded from the flagging pipeline (reference/circle-packing only).
 * - Subfactor status is evaluated using threshold groups from buildSubfactorList:
 *   metrics sharing the same (factor_threshold, evidence_threshold) pair are
 *   pooled and evaluated together. A subfactor flags if any group reaches its
 *   factor_threshold; it concludes no_flag if any group reaches its evidence_threshold.
 * - Factor and system statuses are rolled up from their children's statuses via
 *   rollupStatuses.
 * - prelim_flag is derived from system statuses using the ANA decision tree.
 *
 * Status vocabulary (used at all levels from metric to system):
 *   'flag'                 — threshold crossed / acute needs detected
 *   'no_flag'              — enough evidence to conclude no acute needs
 *   'insufficient_evidence'— some data present but not enough to conclude
 *   'no_data'              — no data at all for this level
 * 
 * Status vocabulary at prelim_flag level:
 *   'em' 				    	 — enough mortality data to conclude excess mortality
 *   'roem'              — enough across systems + health outcomes information to conclude Risk of Excess Mortality
 *   'acute_needs'       — enough evidence to conclude acute needs 
 * 	 'no_acute_needs'    — enough evidence to conclude no acute needs 
 *   'insufficient_evidence' — some data present but not enough to conclude
 *   'no_data'               — no data at all for this level
 */

/* --------------------- Types --------------------- */

type Row = Record<string, any>;
type Status = 'flag' | 'no_flag' | 'insufficient_evidence' | 'no_data';
type ThresholdGroup = { factor_threshold: number; evidence_threshold: number; codes: string[] };
type MutateSpec = Record<string, (d: Row) => unknown>;

/* --------------------- Helpers --------------------- */

const isNumber = (v: unknown): v is number => typeof v === 'number' && !Number.isNaN(v);


/* ------------------- Metric level ------------------- */


/**
 * Build a mutate spec object for a single metric ID.
 *
 * PURPOSE: Generates four transformation functions applied sequentially to every
 * row, so later entries can rely on values computed by earlier ones
 * (e.g. `_status` reads the `_flag` computed just before it).
 *
 * OUTPUT COLUMNS:
 * 1. {id}_flag               — boolean | null. Whether the metric crosses the AN threshold.
 * 2. {id}_status             — 'flag' | 'no_flag' | 'no_data'. Derived from the flag.
 * 3. {id}_within_10perc      — boolean | null. Value is within 10% of threshold (either side).
 * 4. {id}_within_10perc_change — boolean | null. Within 10% but has NOT yet crossed the threshold.
 *
 * @param id - Canonical metric ID (e.g. `"MET001"`).
 * @param md - Metric metadata from `getMetricMetadata` (needs `raw.thresholds.an` and `raw.above_or_below`).
 * @returns Object mapping column names to row-transform functions.
 */
function makeMetricSpec(id: string, md: any): MutateSpec {

	// Step 1: Access key needed items

	// Construct the key for the boolean flag column (e.g., "MET001_flag")
	const flagKey = `${id}_flag`;
	// Extract the "Acute Needs" threshold from metadata. 
	// If missing, we cannot calculate a flag, so we default to null.
	const th: number | null = md?.raw?.thresholds?.an ?? null;
	// Extract the direction: 'Above' or 'Below'
	const dir: string | null = md?.raw?.above_or_below ?? null;

	return {
				/** 1. {id}_flag — true/false if value crosses the AN threshold; null if no threshold, direction, or value. */
		[`${id}_flag`]: (d) => {
			if (th === null || dir === null) return null;
			const v = d[id];
			if (v == null || !isNumber(v)) return null;
			return dir === 'Above' ? v >= th : v <= th;
		},
		/** 2. {id}_status — 'flag' | 'no_flag' | 'no_data', derived from the flag computed above. */
		[`${id}_status`]: (d) => {
			const f = d[flagKey];
			if (f == null) return 'no_data';
			return f ? 'flag' : 'no_flag';
		},
		/** 3. {id}_within_10perc — true if |(v − th) / th| ≤ 0.1, regardless of direction; special-cased when th = 0. */
		[`${id}_within_10perc`]: (d) => {
			if (th === null) return null;
			const v = d[id];
			if (!isNumber(v)) return null;
			if (th === 0) return v === 0;
			return Math.abs((v - th) / th) <= 0.1;
		},
		
		/** 4. {id}_within_10perc_change — true if within 10% of threshold but NOT yet flagged ("approaching"). */
		[`${id}_within_10perc_change`]: (d) => {
			if (th === null || dir === null || th === 0) return null;
			const v = d[id];
			if (!isNumber(v)) return null;
			const pct = Math.abs((v - th) / th);
			const met = dir === 'Above' ? v >= th : v <= th;
			return pct <= 0.1 && !met;
		}
	};
}



/* ------------------- Subfactor level ------------------- */

/**
 * Evaluate a single threshold group against a row.
 *
 * Counts flagged vs. no-flag metrics in the group, then compares against
 * `factor_threshold` and `evidence_threshold` to decide group status.
 * Metrics with null flags (no data) are ignored in both counts.
 *
 * @param group - Threshold group: `codes` (metric IDs), `factor_threshold`, `evidence_threshold`.
 * @param d - Row with pre-computed `{id}_flag` booleans for each code in the group.
 * @returns `'flag' | 'no_flag' | 'insufficient_evidence' | 'no_data'`
 */
function evaluateGroup(group: ThresholdGroup, d: Row): Status {

	// Step 0: Initialize 
	let flag_n = 0;
	let no_flag_n = 0;

	// Step 1: Aggregate counts for the current row across all metrics in this group
	for (const c of group.codes) {
		// Access the pre-computed boolean flag for this specific metric (e.g., "MET001_flag")
		const f = d[`${c}_flag`];
		
		if (f === true) {
			flag_n++; 
		} else if (f === false) {
			no_flag_n++; 
		}
		// If f is null/undefined, skip it (contributes to the "missing data" gap)
	}

	const data_n = flag_n + no_flag_n; // Total number of metrics with data in this group

	// Step 2: Apply Decision Logic (Priority Order)
	if (flag_n >= group.factor_threshold) return 'flag';
	if (data_n >= group.evidence_threshold) return 'no_flag';
	if (data_n === 0) return 'no_data';
	return 'insufficient_evidence';
}



/* ---------------- Subfactor to System level ---------------- */

/**
 * Roll up child status strings into a single parent status.
 * Used for subfactor→factor and factor→system rollups.
 *
 * Priority: flag > no_flag > insufficient_evidence > no_data.
 * Exception: all-no_data stays no_data rather than insufficient_evidence,
 * to distinguish "nothing collected" from "some data but not enough to conclude".
 *
 * @param statuses - Status values from child nodes (subfactors or factors).
 * @returns Aggregated parent status.
 */
function rollupStatuses(statuses: Status[]): Status {
	if (statuses.length === 0) return 'no_data';
	if (statuses.some((s) => s === 'flag')) return 'flag';
	if (statuses.every((s) => s === 'no_flag')) return 'no_flag';
	if (statuses.every((s) => s === 'no_data')) return 'no_data';
	return 'insufficient_evidence';
}

/**
 * Build a mutate spec for group-level indicator counts (used by the heatmap).
 * Produces `${prefix}.missing_n`, `${prefix}.flag_n`, `${prefix}.no_flag_n`.
 *
 * @param prefix - Column prefix — typically a subfactor or factor path.
 * @param codes - Metric IDs to count across.
 * @returns Mutate spec object mapping column names to row-transform functions.
 */
function makeCountSpec(prefix: string, codes: string[]): MutateSpec {
	return {
		[`${prefix}.missing_n`]: (d) =>
			codes.reduce((acc, c) => acc + (d[c] == null ? 1 : 0), 0),
		[`${prefix}.flag_n`]: (d) =>
			codes.reduce((acc, c) => acc + (d[`${c}_flag`] === true ? 1 : 0), 0),
		[`${prefix}.no_flag_n`]: (d) =>
			codes.reduce((acc, c) => acc + (d[`${c}_flag`] === false ? 1 : 0), 0)
	};
}

/**
 * Build a `{ [id]: metadata }` lookup for a list of metric IDs.
 * IDs whose metadata cannot be found are silently omitted.
 *
 * @param ids - Canonical metric IDs to look up.
 * @param referenceJson - Parsed `reference.json` passed to `getMetricMetadata`.
 * @returns Record mapping each metric ID to its metadata object.
 */
function extractMetricMetadata(ids: string[], referenceJson: unknown): Record<string, any> {
	return Object.fromEntries(
		ids.flatMap((id) => {
			const md = getMetricMetadata(referenceJson, id);
			return md ? [[id, md]] : [];
		})
	);
}

/* --------------------- Main entry --------------------- */

/**
 * Flag data rows using the reference JSON metadata.
 * Runs five sequential mutate layers: metric → subfactor → factor → system → prelim_flag.
 *
 * @param items - Input rows; each must include a `uoa` field.
 * @param referenceJson - Parsed `reference.json`.
 * @returns Rows enriched with per-metric flags/statuses, rollup statuses at every level, and `prelim_flag`.
 */
export function flagData(items: Row[], referenceJson: unknown): Row[] {
	if (!Array.isArray(items) || items.length === 0) return [];
	if (!referenceJson) throw new Error('referenceJson is required');

	// ── Setup ─────────────────────────────────────────────────────────────────

	// all metric ids (order preserved by getAllMetricIds)
	const allMetricIds: string[] = getAllMetricIds(referenceJson);

	// metadata lookup: id → { raw, systemId, factorId, subfactorId, ... }
	const metadata = extractMetricMetadata(allMetricIds, referenceJson);

	// preference-3 metrics are for reference/circle-packing only — exclude from flagging
	const canonicalIds = allMetricIds.filter((id) => (metadata[id]?.raw?.preference ?? 1) !== 3);

	// pad each row with explicit null for any canonical indicator column not present in input
	const padded: Row[] = items.map((r) => {
		const out = { ...r };
		for (const id of canonicalIds) {
			if (!(id in out)) out[id] = null;
		}
		return out;
	});

	// ── Layer 1: indicator-level spec ─────────────────────────────────────────
	// One spec object per indicator merged into one flat object.
	// Within a single mutate() call, entries are applied sequentially (each entry
	// receives the already-mutated row), so {id}_status can safely read {id}_flag.
	const metricSpec: MutateSpec = Object.assign(
		{},
		...canonicalIds.map((id) => makeMetricSpec(id, metadata[id]))
	);

	// ── Layer 2: subfactor-level spec ─────────────────────────────────────────

	const dataKeySet = new Set(canonicalIds);
	const subList = buildSubfactorList(referenceJson) || [];

	// Hierarchy lookup built while iterating subfactors, reused for layers 3 & 4.
	// factorCodes[factorKey]     → indicator codes under that factor
	// factorSfPaths[factorKey]   → subfactor paths under that factor
	// systemCodes[systemId]      → indicator codes under that system
	// systemFactorKeys[systemId] → factor keys under that system
	const factorCodes: Record<string, string[]> = {};
	const factorSfPaths: Record<string, string[]> = {};
	const systemCodes: Record<string, string[]> = {};
	const systemFactorKeys: Record<string, string[]> = {};

	const subfactorSpec: MutateSpec = {};

	for (const { path, codes, groups } of subList) {
		// restrict to indicators present in the canonical data
		const inData = codes.filter((c: string) => dataKeySet.has(c));
		if (inData.length === 0) continue;

		// filter threshold groups to codes present in the data
		const inDataGroups: ThresholdGroup[] = groups
			.map((g: ThresholdGroup) => ({ ...g, codes: g.codes.filter((c: string) => dataKeySet.has(c)) }))
			.filter((g: ThresholdGroup) => g.codes.length > 0);

		// backward-compat counts + threshold-aware status
		Object.assign(subfactorSpec, makeCountSpec(path, inData));
		subfactorSpec[`${path}.status`] = (d) => {
			if (inDataGroups.length === 0) return 'no_data';
			const groupStatuses = inDataGroups.map((g) => evaluateGroup(g, d));
			if (groupStatuses.some((s) => s === 'flag')) return 'flag';
			if (groupStatuses.some((s) => s === 'no_flag')) return 'no_flag';
			if (groupStatuses.some((s) => s === 'insufficient_evidence')) return 'insufficient_evidence';
			return 'no_data';
		};

		// accumulate paths for layers 3 & 4
		const [systemId, factorId] = path.split('.');
		if (!systemId || !factorId) continue;
		const factorKey = `${systemId}.${factorId}`;

		(factorCodes[factorKey] ??= []).push(...inData);
		(factorSfPaths[factorKey] ??= []).push(path);
		(systemCodes[systemId] ??= []).push(...inData);
		// deduplicate: a factor key is pushed once per subfactor without this guard
		const sfKeys = (systemFactorKeys[systemId] ??= []);
		if (!sfKeys.includes(factorKey)) sfKeys.push(factorKey);
	}

	// ── Layer 3: factor-level spec ────────────────────────────────────────────
	// Status is a rollup of the subfactor statuses written in Layer 2.
	const factorSpec: MutateSpec = {};
	for (const [factorKey, sfPaths] of Object.entries(factorSfPaths)) {
		Object.assign(factorSpec, makeCountSpec(factorKey, factorCodes[factorKey]));
		factorSpec[`${factorKey}.status`] = (d) =>
			rollupStatuses(sfPaths.map((p) => (d[`${p}.status`] ?? 'no_data') as Status));
	}

	// ── Layer 4: system-level spec ────────────────────────────────────────────
	// Status is a rollup of the factor statuses written in Layer 3.
	const systemSpec: MutateSpec = {};
	for (const [systemId, fKeys] of Object.entries(systemFactorKeys)) {
		Object.assign(systemSpec, makeCountSpec(systemId, systemCodes[systemId]));
		systemSpec[`${systemId}.status`] = (d) =>
			rollupStatuses(fKeys.map((k) => (d[`${k}.status`] ?? 'no_data') as Status));
	}

	// ── Layer 5: ANA preliminary flag classification ──────────────────────────
	const allSystemIds = Object.keys(systemFactorKeys);
	const json = referenceJson as any;
	const knownSystems = new Set<string>(json.systems?.map((s: any) => s.id) ?? []);
	const mortalitySystemId = knownSystems.has('mortality') ? 'mortality' : null;
	const healthOutcomesId = knownSystems.has('health_outcomes') ? 'health_outcomes' : null;
	const marketId = knownSystems.has('market_functionality') ? 'market_functionality' : null;

	// market_functionality does not enter the classification
	const activeSystems = allSystemIds.filter((s) => s !== marketId);

	const prelimFlagFn = (d: Row) => {
		const status = (key: string | null) => (key ? (d[`${key}.status`] ?? 'no_data') : 'no_data');
		const isFlagged = (key: string | null) => status(key) === 'flag';
		const isInsuff = (key: string | null) => status(key) === 'insufficient_evidence';

		// 1. Emergency — mortality system flagged
		if (isFlagged(mortalitySystemId)) return 'EM';

		// 2. Risk of Emergency — health outcomes flagged AND ≥3 other active systems flagged
		const otherFlagged = activeSystems.filter((s) => s !== healthOutcomesId && isFlagged(s)).length;
		if (isFlagged(healthOutcomesId) && otherFlagged >= 3) return 'ROEM';

		// 3. Acute Needs — any active system flagged
		if (activeSystems.some(isFlagged)) return 'ACUTE';

		// 4. Insufficient Evidence — no flag, but at least one system has insufficient evidence
		if (activeSystems.some(isInsuff)) return 'INSUFFICIENT_EVIDENCE';

		// 5. No Data — no flag, no insufficient evidence, all systems are no_data
		if (activeSystems.every((s) => status(s) === 'no_data')) return 'NO_DATA';

		// 6. No Acute Needs — all active systems are no_flag (or mix of no_flag + no_data)
		return 'ACUTE_NEEDS';
	};

	// ── Pipeline ──────────────────────────────────────────────────────────────
	// Five sequential mutate() steps, one per logical layer — mirrors dplyr's
	// pipe: padded |> mutate(...) |> mutate(...) |> ...
	return tidy(
		padded,
		mutate(metricSpec), // Layer 1: per-metric _flag, _status, _within_10perc (preference 1+2 only)
		mutate(subfactorSpec), // Layer 2: subfactor counts + threshold-aware status
		mutate(factorSpec),    // Layer 3: factor counts + rollup status
		mutate(systemSpec),    // Layer 4: system counts + rollup status
		mutate({ prelim_flag: prelimFlagFn }) // Layer 5: ANA classification
	);
}
