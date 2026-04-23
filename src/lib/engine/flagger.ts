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
 * Assumes validator has ensured `uoa` exists on every row and metric column names are the canonical IDs used in indicatorsJson.
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
 * PURPOSE:
 * Generates a set of four transformation functions (a "spec") that will be applied to every row in the dataset for a specific metric. These functions run sequentially (piped as dplyr), allowing later functions to rely on values calculated by earlier ones (e.g., calculating `_status` based on the newly created `_flag`).
 * 
 * OUTPUT COLUMNS:
 * 1. {id}_flag              — boolean (true/false) or null. Indicates if the metric crosses the critical threshold.
 * 2. {id}_status            — string ('flag', 'no_flag', or 'no_data'). A simplified status derived directly from the flag.
 * 3. {id}_within_10perc     — boolean or null. Checks if the value is within 10% of the threshold (regardless of direction).
 * 4. {id}_within_10perc_change — boolean or null. Checks if the value is within 10%  of the threshold BUT has NOT crossed it.
 * 
 * @param id - The unique canonical ID of the metric (e.g., "MET001").
 * @param md - The metadata object for this metric, containing configuration like  thresholds and direction (e.g., { raw: { thresholds: { an: 5 }, above_or_below: 'Above' } }).
 * @returns An object mapping column names to transformation functions.
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
				/**
		 * 1. Calculate the Boolean Flag ({id}_flag)
		 * 
		 * LOGIC:
		 * - Returns null if the threshold or direction is missing (cannot evaluate).
		 * - Returns null if the data value is missing or not a number.
		 * - If 'Above': Returns true if value >= threshold.
		 * - If 'Below': Returns true if value <= threshold.
		 */
		[`${id}_flag`]: (d) => {
			if (th === null || dir === null) return null;
			const v = d[id];
			if (v == null || !isNumber(v)) return null;
			return dir === 'Above' ? v >= th : v <= th;
		},
		/**
		 * 2. Derive the Status String ({id}_status)
		 * 
		 * LOGIC:
		 * - Reads the boolean flag calculated in the previous step.
		 * - If the flag is null (missing data), returns 'no_data'.
		 * - If the flag is true, returns 'flag'.
		 * - If the flag is false, returns 'no_flag'.
		 */
		[`${id}_status`]: (d) => {
			const f = d[flagKey];
			if (f == null) return 'no_data';
			return f ? 'flag' : 'no_flag';
		},
		/**
		 * 3. Check Proximity to Threshold ({id}_within_10perc)
		 * 
		 * LOGIC:
		 * - Calculates the percentage difference between the value (v) and the threshold (th).
		 * - Formula: | (v - th) / th | <= 0.1
		 * - Returns true if the value is within 10% of the threshold, regardless of whether it has crossed it or not.
		 * - Special case: If threshold is 0, checks if value is exactly 0.
		 */
		[`${id}_within_10perc`]: (d) => {
			if (th === null) return null;
			const v = d[id];
			if (!isNumber(v)) return null;
			if (th === 0) return v === 0;
			return Math.abs((v - th) / th) <= 0.1;
		},
		
		/**
		 * 4. Check "Approaching" Status ({id}_within_10perc_change)
		 * 
		 * LOGIC:
		 * - Identifies values that are close to the threshold (within 10%) but have NOT yet triggered the flag.
		 * 
		 * CONDITIONS:
		 * 1. Threshold and direction must exist.
		 * 2. Value must be a number.
		 * 3. Percentage difference must be <= 10%.
		 * 4. The value must NOT meet the flag condition (i.e., !met).
		 */
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
 * Evaluate a single threshold group against the current row.
 * 
 * CONTEXT:
 * A "group" represents a set of metrics that share the same logical criteria 
 * (factor_threshold and evidence_threshold) within a specific subfactor.
 * Instead of evaluating metrics individually for the final status, we pool them
 * to determine if the collective evidence is sufficient to trigger a flag or 
 * confirm no_flag.
 * 
 * LOGIC FLOW:
 * 1. Iterate through all metric codes in the group.
 * 2. Count how many metrics have triggered a 'flag' (true) vs. confirmed 'no_flag' (false).
 *    Note: We ignore metrics with null/undefined values here; they contribute to neither count.
 * 3. Apply the decision hierarchy:
 *    - FLAG: If the count of flagged metrics meets/exceeds the `factor_threshold`, the group returns 'flag'. This indicates acute needs are detected.
 *    - NO FLAG: If the count of metrics with values (flags + no_flags) meets the `evidence_threshold`, the group returns 'no_flag'. This means we have enough data points to confidently conclude there are no acute needs.
 *    - NO DATA: If no metrics in this group had any data (count is 0), return 'no_data'.
 *    - INSUFFICIENT EVIDENCE: If we have some data but haven't hit the thresholds for either flag or no_flag, return 'insufficient_evidence'.
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
 * Roll up an array of status strings into a single status.
 * Used for subfactor -> factor and factor -> system rollups.
 *
 * Priority: flag > no_flag > insufficient_evidence > no_data
 *
 * Note: if all children are no_data, return no_data rather than
 * insufficient_evidence, to distinguish "nothing collected" from "some data
 * but not enough to conclude".
 */
function rollupStatuses(statuses: Status[]): Status {
	if (statuses.length === 0) return 'no_data';
	if (statuses.some((s) => s === 'flag')) return 'flag';
	if (statuses.every((s) => s === 'no_flag')) return 'no_flag';
	if (statuses.every((s) => s === 'no_data')) return 'no_data';
	return 'insufficient_evidence';
}

/**
 * Build a mutate spec object for group-level indicator counts.
 * Retained for the heatmap visualisation.
 * Returns columns: `${prefix}.missing_n`, `${prefix}.flag_n`, `${prefix}.no_flag_n`
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

/** Build a metadata lookup: id → getMetricMetadata result. */
function extractMetricMetadata(ids: string[], indicatorsJson: unknown): Record<string, any> {
	return Object.fromEntries(
		ids.flatMap((id) => {
			const md = getMetricMetadata(indicatorsJson, id);
			return md ? [[id, md]] : [];
		})
	);
}

/* --------------------- Main entry --------------------- */

/**
 * Flag data rows using indicators.json metadata.
 *
 * @param items - input rows (each must include `uoa`)
 * @param indicatorsJson - parsed indicators.json
 */
export function flagData(items: Row[], indicatorsJson: unknown): Row[] {
	if (!Array.isArray(items) || items.length === 0) return [];
	if (!indicatorsJson) throw new Error('indicatorsJson is required');

	// ── Setup ─────────────────────────────────────────────────────────────────

	// all metric ids (order preserved by getAllMetricIds)
	const allMetricIds: string[] = getAllMetricIds(indicatorsJson);

	// metadata lookup: id → { raw, systemId, factorId, subfactorId, ... }
	const metadata = extractMetricMetadata(allMetricIds, indicatorsJson);

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
	const subList = buildSubfactorList(indicatorsJson) || [];

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
	const json = indicatorsJson as any;
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

		// 6. No Acute Needs — all active systems are no_flag
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
