import { tidy, mutate } from '@tidyjs/tidy';
import {
	buildSubfactorList,
	getMetricMetadata,
	getAllMetricIds
} from '$lib/engine/metricMetadata';
import { SystemIDEnum } from '$lib/types/structure';
import type { ReferenceRoot } from '$lib/types/structure';
import type { FlagStatus } from '$lib/types/flags';

/**
 * Lightweight, modular flagger
 *
 * - Entry: flagData(items, referenceJson)
 *
 * Assumes validator has ensured `uoa` exists on every row and metric column names
 * are the canonical IDs used in referenceJson.
 *
 * Implementation notes:
 * - Missing canonical indicator columns are null-padded onto each input row before
 *   the mutate pass, so output rows always carry explicit nulls for every canonical id.
 * - Per-metric flags and within-10% computations are generated via makeMetricSpec.
 *   Preference-3 metrics are excluded from the flagging pipeline entirely.
 *   Supporting-evidence metrics get metric-level flags but are excluded from
 *   subfactor/factor/system rollup.
 * - Subfactor status is evaluated using threshold groups from buildSubfactorList.
 * - Factor and system statuses are rolled up from their children via rollupStatuses.
 * - priority_flag is derived from system statuses using the ANA decision tree.
 *
 * Status vocabulary (used at all levels from metric to system):
 *   'flag'                  — threshold crossed / acute needs detected
 *   'no_flag'               — enough evidence to conclude no acute needs
 *   'insufficient_evidence' — some data present but not enough to conclude
 *   'no_data'               — no data at all for this level
 *
 * Priority flag values (8-level decision tree):
 *   'em'                    — excess mortality (mortality system flagged)
 *   'ho_primary'            — HO proportion rule met
 *   'ho_secondary'          — any HO metric has VAN flag
 *   'an_primary'            — HO system flagged, or any VAN flag, or ≥3 systems flagged
 *   'an_secondary'          — 1–2 non-HO classification systems flagged
 *   'insufficient_evidence' — some systems have gaps, none flagged
 *   'no_data'               — all classification systems no_data
 *   'no_acute_needs'        — all systems have sufficient data, none flagged
 */

/* --------------------- Types --------------------- */

type Row = Record<string, any>;
type Status = FlagStatus;
type ThresholdGroup = { subfactor_threshold: number; evidence_threshold: number; codes: string[] };
type MutateSpec = Record<string, (d: Row) => unknown>;

/* --------------------- Helpers --------------------- */

const isNumber = (v: unknown): v is number => typeof v === 'number' && !Number.isNaN(v);

/* ------------------- Metric level ------------------- */

/**
 * Build a mutate spec object for a single metric ID.
 *
 * OUTPUT COLUMNS (6 per metric):
 * 1. {id}_flag                — boolean | null. AN threshold crossed.
 * 2. {id}_status              — 'flag' | 'no_flag' | 'no_data'. From AN flag.
 * 3. {id}_van_flag            — boolean | null. VAN threshold crossed (null if no VAN threshold).
 * 4. {id}_van_status          — 'flag' | 'no_flag' | 'no_data'. From VAN flag.
 * 5. {id}_within_10perc       — boolean | null. Value within 10% of AN threshold.
 * 6. {id}_within_10perc_change — boolean | null. Within 10% but not yet flagged.
 */
function makeMetricSpec(id: string, md: any): MutateSpec {
	const flagKey = `${id}_flag`;
	const vanFlagKey = `${id}_van_flag`;
	const th: number | null = md?.raw?.thresholds?.an ?? null;
	const van: number | null = md?.raw?.thresholds?.van ?? null;
	const dir: string | null = md?.raw?.above_or_below ?? null;

	return {
		[`${id}_flag`]: (d) => {
			if (th === null || dir === null) return null;
			const v = d[id];
			if (v == null || !isNumber(v)) return null;
			return dir === 'Above' ? v >= th : v <= th;
		},
		[`${id}_status`]: (d) => {
			const f = d[flagKey];
			if (f == null) return 'no_data';
			return f ? 'flag' : 'no_flag';
		},
		[`${id}_van_flag`]: (d) => {
			if (van === null || dir === null) return null;
			const v = d[id];
			if (v == null || !isNumber(v)) return null;
			return dir === 'Above' ? v >= van : v <= van;
		},
		[`${id}_van_status`]: (d) => {
			const f = d[vanFlagKey];
			if (f == null) return 'no_data';
			return f ? 'flag' : 'no_flag';
		},
		[`${id}_within_10perc`]: (d) => {
			if (th === null) return null;
			const v = d[id];
			if (!isNumber(v)) return null;
			if (th === 0) return v === 0;
			return Math.abs((v - th) / th) <= 0.1;
		},
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
 * Counts flagged vs. no-flag metrics, compares against subfactor_threshold and
 * evidence_threshold. Metrics with null flags (no data) are ignored in both counts.
 */
function evaluateGroup(group: ThresholdGroup, d: Row): Status {
	let flag_n = 0;
	let no_flag_n = 0;

	for (const c of group.codes) {
		const f = d[`${c}_flag`];
		if (f === true) flag_n++;
		else if (f === false) no_flag_n++;
	}

	const data_n = flag_n + no_flag_n;
	if (flag_n >= group.subfactor_threshold) return 'flag';
	if (data_n >= group.evidence_threshold) return 'no_flag';
	if (data_n === 0) return 'no_data';
	return 'insufficient_evidence';
}

/* ---------------- Subfactor to System level ---------------- */

/**
 * Roll up child status strings into a single parent status.
 * Priority: flag > no_flag > insufficient_evidence > no_data.
 * All-no_data stays no_data (not insufficient_evidence).
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
 * Runs five sequential mutate layers: metric → subfactor → factor → system → priority_flag.
 *
 * @param items - Input rows; each must include a `uoa` field.
 * @param referenceJson - Parsed `reference.json`.
 * @returns Rows enriched with per-metric flags/statuses, rollup statuses at every level,
 *          VAN flags, and `priority_flag`.
 */
export function flagData(items: Row[], referenceJson: unknown): Row[] {
	if (!Array.isArray(items) || items.length === 0) return [];
	if (!referenceJson) throw new Error('referenceJson is required');

	// ── Setup ─────────────────────────────────────────────────────────────────

	const allMetricIds: string[] = getAllMetricIds(referenceJson);
	const metadata = extractMetricMetadata(allMetricIds, referenceJson);

	// preference-3 metrics are reference/circle-packing only — excluded entirely
	const canonicalIds = allMetricIds.filter((id) => (metadata[id]?.raw?.preference ?? 1) !== 3);

	// rollup ids exclude supporting-evidence metrics (they still get metric-level flags)
	const rollupIds = canonicalIds.filter(
		(id) => metadata[id]?.raw?.evidence_type !== 'Supporting evidence'
	);

	// pad each row with explicit null for any canonical column not in input
	const padded: Row[] = items.map((r) => {
		const out = { ...r };
		for (const id of canonicalIds) {
			if (!(id in out)) out[id] = null;
		}
		return out;
	});

	// ── Layer 1: metric-level spec ────────────────────────────────────────────
	// Runs for ALL canonicalIds (including supporting evidence metrics).
	const metricSpec: MutateSpec = Object.assign(
		{},
		...canonicalIds.map((id) => makeMetricSpec(id, metadata[id]))
	);

	// ── Layer 2: subfactor-level spec ─────────────────────────────────────────
	// Uses rollupIds only — supporting-evidence metrics excluded from counts and status.

	const rollupKeySet = new Set(rollupIds);
	const subList = buildSubfactorList(referenceJson) || [];

	const factorCodes: Record<string, string[]> = {};
	const factorSfPaths: Record<string, string[]> = {};
	const systemCodes: Record<string, string[]> = {};
	const systemFactorKeys: Record<string, string[]> = {};

	const subfactorSpec: MutateSpec = {};

	for (const { path, codes, groups } of subList) {
		const inData = codes.filter((c: string) => rollupKeySet.has(c));
		if (inData.length === 0) continue;

		const inDataGroups: ThresholdGroup[] = groups
			.map((g: ThresholdGroup) => ({ ...g, codes: g.codes.filter((c: string) => rollupKeySet.has(c)) }))
			.filter((g: ThresholdGroup) => g.codes.length > 0);

		Object.assign(subfactorSpec, makeCountSpec(path, inData));
		subfactorSpec[`${path}.status`] = (d) => {
			if (inDataGroups.length === 0) return 'no_data';
			const groupStatuses = inDataGroups.map((g) => evaluateGroup(g, d));
			if (groupStatuses.some((s) => s === 'flag')) return 'flag';
			if (groupStatuses.some((s) => s === 'no_flag')) return 'no_flag';
			if (groupStatuses.some((s) => s === 'insufficient_evidence')) return 'insufficient_evidence';
			return 'no_data';
		};

		const [systemId, factorId] = path.split('.');
		if (!systemId || !factorId) continue;
		const factorKey = `${systemId}.${factorId}`;

		(factorCodes[factorKey] ??= []).push(...inData);
		(factorSfPaths[factorKey] ??= []).push(path);
		(systemCodes[systemId] ??= []).push(...inData);
		const sfKeys = (systemFactorKeys[systemId] ??= []);
		if (!sfKeys.includes(factorKey)) sfKeys.push(factorKey);
	}

	// ── Layer 3: factor-level spec ────────────────────────────────────────────
	const factorSpec: MutateSpec = {};
	for (const [factorKey, sfPaths] of Object.entries(factorSfPaths)) {
		Object.assign(factorSpec, makeCountSpec(factorKey, factorCodes[factorKey]));
		factorSpec[`${factorKey}.status`] = (d) =>
			rollupStatuses(sfPaths.map((p) => (d[`${p}.status`] ?? 'no_data') as Status));
	}

	// ── Layer 4: system-level spec ────────────────────────────────────────────
	const systemSpec: MutateSpec = {};
	for (const [systemId, fKeys] of Object.entries(systemFactorKeys)) {
		Object.assign(systemSpec, makeCountSpec(systemId, systemCodes[systemId]));
		systemSpec[`${systemId}.status`] = (d) =>
			rollupStatuses(fKeys.map((k) => (d[`${k}.status`] ?? 'no_data') as Status));
	}

	// ── Layer 5: priority flag decision tree ──────────────────────────────────

	const ref = referenceJson as ReferenceRoot;
	const refSystemIds = ref.systems.map((s) => s.id);

	const mortalityId = refSystemIds.includes(SystemIDEnum.Mortality)
		? SystemIDEnum.Mortality
		: null;
	const healthOutcomesId = refSystemIds.includes(SystemIDEnum.HealthOutcomes)
		? SystemIDEnum.HealthOutcomes
		: null;

	if (!mortalityId || !healthOutcomesId) {
		const missing = [
			!mortalityId && SystemIDEnum.Mortality,
			!healthOutcomesId && SystemIDEnum.HealthOutcomes
		]
			.filter(Boolean)
			.join(', ');
		throw new Error(
			`flagData: required system IDs missing from reference.json: ${missing}. ` +
				'Run validate:reference-json to diagnose.'
		);
	}

	// Classification systems = all except market_functionality and mortality
	const classificationSystems = refSystemIds.filter(
		(s) => s !== SystemIDEnum.MarketFunctionality && s !== SystemIDEnum.Mortality
	);

	// Non-supporting-evidence HO metrics (for proportion rule and VAN checks)
	const hoMetricIds = canonicalIds.filter(
		(id) =>
			metadata[id]?.systemId === healthOutcomesId &&
			metadata[id]?.raw?.evidence_type !== 'Supporting evidence'
	);

	// All non-supporting-evidence metrics in classification systems (for VAN breadth check)
	const allClassificationMetricIds = canonicalIds.filter(
		(id) =>
			classificationSystems.includes(metadata[id]?.systemId) &&
			metadata[id]?.raw?.evidence_type !== 'Supporting evidence'
	);

	// Metrics where van adds genuine signal beyond an (van !== an and van is set).
	// Metrics with van === an are excluded from ho_secondary and an_primary VAN branches
	// since crossing VAN provides no information beyond crossing AN.
	const hoVanEligibleIds = hoMetricIds.filter(
		(id) => metadata[id]?.raw?.van_is_strict === true
	);
	const allVanEligibleIds = allClassificationMetricIds.filter(
		(id) => metadata[id]?.raw?.van_is_strict === true
	);

	const priorityFlagFn = (d: Row): string => {
		const status = (key: string): Status => ((d[`${key}.status`] as Status) ?? 'no_data');
		const isFlagged = (key: string) => status(key) === 'flag';

		// 0. Excess mortality — checked first; mortality data always overrides coverage gaps
		if (isFlagged(mortalityId)) return 'em';

		// 1. Early exit: all classification systems have no data (and no mortality flag above)
		if (classificationSystems.every((s) => status(s) === 'no_data')) return 'no_data';

		// 2. HO proportion rule: (n>5 and ≥2/3 flag) OR (1≤n≤5 and ≥1/2 flag)
		const hoAvail = hoMetricIds.filter((id) => d[`${id}_flag`] !== null).length;
		const hoFlagged = hoMetricIds.filter((id) => d[`${id}_flag`] === true).length;
		if (hoAvail > 5 && hoFlagged / hoAvail >= 2 / 3) return 'ho_primary';
		if (hoAvail > 0 && hoAvail <= 5 && hoFlagged / hoAvail >= 0.5) return 'ho_primary';

		// 3. Any HO metric has VAN flag (only strict-VAN metrics: van ≠ an)
		if (hoVanEligibleIds.some((id) => d[`${id}_van_flag`] === true)) return 'ho_secondary';

		// 4. AN depth & breadth — HO uses system-level rollup (same rule as other systems)
		const anyVanFlag = allVanEligibleIds.some((id) => d[`${id}_van_flag`] === true);
		const nSystemsFlagged = classificationSystems.filter((s) => isFlagged(s)).length;
		if (isFlagged(healthOutcomesId) || anyVanFlag || nSystemsFlagged >= 3) return 'an_primary';

		// 5. Any classification system flagged
		if (classificationSystems.some(isFlagged)) return 'an_secondary';

		// 6. No flags but some systems have gaps
		const hasGaps = classificationSystems.some(
			(s) => status(s) === 'no_data' || status(s) === 'insufficient_evidence'
		);
		if (hasGaps) return 'insufficient_evidence';

		// 7. All systems have data, nothing flagged
		return 'no_acute_needs';
	};

	// ── Pipeline ──────────────────────────────────────────────────────────────
	return tidy(
		padded,
		mutate(metricSpec),
		mutate(subfactorSpec),
		mutate(factorSpec),
		mutate(systemSpec),
		mutate({ priority_flag: priorityFlagFn })
	);
}
