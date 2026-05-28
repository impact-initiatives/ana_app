/**
 * metricMetadata.ts — OWNERSHIP: metadata lookup layer.
 *
 * Responsibility boundary:
 *  - Traversing the reference.json structure to retrieve rich metadata
 *    objects (system, factor, subfactor, indicator concept, metric leaf).
 *  - ID path helpers for filtering views by system/factor/subfactor.
 *
 * Do NOT add fetch or flatten logic here. Use metricStore.svelte.ts instead.
 *
 * Assumptions (strict):
 * - The JSON structure always follows:
 *     system → factor → subfactor → indicator (concept) → metric (leaf).
 *   There are no metrics directly under a subfactor — all metrics live inside
 *   `sub_factors[*].indicators[*].metrics`.
 * - Every metric entry has a `metric` property whose value is the canonical MET id
 *   (e.g. "MET001"). Thresholds and type constraints live on the metric.
 * - Human-readable labels are stored in the `label` property for systems, factors,
 *   subfactors, indicators, and metrics alike.
 * - Path matching uses exact equality on `id` fields (no normalization performed).
 *
 * Exports:
 *  - getAllMetricIds(json) -> string[]
 *  - getMetricIdsForPath(json, systemId, factorId, subfactorId) -> string[]
 *  - buildSubfactorList(json) -> SubfactorEntry[]
 *  - getSystemMetadata(json, id) -> object | null
 *  - getFactorMetadata(json, systemId, factorId) -> object | null
 *  - getSubFactorMetadata(json, systemId, factorId, subfactorId) -> object | null
 *  - getIndicatorMetadata(json, indicatorId) -> object | null
 *  - getMetricMetadata(json, metricId) -> object | null
 *  - REFERENCE_TABLE_COLUMNS
 *  - buildReferenceRows(json) -> Record<string, string>[]
 */

/* --------------------- Types --------------------- */

/** A set of metrics within a subfactor sharing the same threshold pair. */
export type ThresholdGroup = {
	factor_threshold: number;
	evidence_threshold: number;
	codes: string[];
};

export type SubfactorEntry = {
	path: string;
	codes: string[];       // flat list of MET ids
	groups: ThresholdGroup[];
};

/* --------------------- Private helpers --------------------- */

/**
 * Extract metric codes from an array of indicator concept entries.
 * Each indicator concept has a `metrics[]` array; this collects all `m.metric` values.
 */
function extractMetricCodes(indicators: any[]): string[] {
	if (!Array.isArray(indicators)) return [];
	const out: string[] = [];
	for (const ind of indicators) {
		if (!ind || !Array.isArray(ind.metrics)) continue;
		for (const m of ind.metrics) {
			if (m && typeof m.metric === 'string') out.push(m.metric);
		}
	}
	return out;
}

/**
 * Build threshold groups from a flat array of metric objects.
 * Metrics sharing the same (factor_threshold, evidence_threshold) pair are grouped.
 * Accepts the flat metrics array directly (callers flatten indicator concepts first).
 */
function buildThresholdGroups(metrics: any[]): ThresholdGroup[] {
	if (!Array.isArray(metrics)) return [];
	const groups = new Map<string, ThresholdGroup>();
	for (const m of metrics) {
		if (!m || typeof m.metric !== 'string') continue;
		const ft: number = m.factor_threshold ?? 1;
		const et: number = m.evidence_threshold ?? 1;
		const key = `${ft}:${et}`;
		if (!groups.has(key)) groups.set(key, { factor_threshold: ft, evidence_threshold: et, codes: [] });
		groups.get(key)!.codes.push(m.metric);
	}
	return Array.from(groups.values());
}

/* --------------------- Exports --------------------- */

/** Get a unique list (in encounter order) of all metric IDs present in the JSON. */
export function getAllMetricIds(json: unknown): string[] {
	const j = json as any;
	const seen = new Set<string>();
	if (!j || !Array.isArray(j.systems)) return [];

	for (const system of j.systems) {
		if (!system || !Array.isArray(system.factors)) continue;
		for (const factor of system.factors) {
			if (!factor) continue;
			const subs = Array.isArray(factor.sub_factors) ? factor.sub_factors : [];
			for (const sub of subs) {
				if (!sub || !Array.isArray(sub.indicators)) continue;
				for (const c of extractMetricCodes(sub.indicators)) {
					if (!seen.has(c)) seen.add(c);
				}
			}
		}
	}

	return Array.from(seen);
}

/** Return metric IDs for the given system/factor/subfactor path. Exact equality on id fields. */
export function getMetricIdsForPath(
	json: unknown,
	systemId: string,
	factorId: string,
	subfactorId: string
): string[] {
	const j = json as any;
	if (!j || !Array.isArray(j.systems)) return [];
	if (!systemId || !factorId || !subfactorId) return [];

	for (const system of j.systems) {
		if (!system || system.id !== systemId) continue;
		const factors = Array.isArray(system.factors) ? system.factors : [];
		for (const factor of factors) {
			if (!factor || factor.id !== factorId) continue;
			const subs = Array.isArray(factor.sub_factors) ? factor.sub_factors : [];
			for (const sub of subs) {
				if (!sub || sub.id !== subfactorId) continue;
				return extractMetricCodes(sub.indicators);
			}
		}
	}

	return [];
}

/**
 * Build a canonical list of subfactors with their metric codes, path strings,
 * and threshold groups. Always emits three-part paths "systemId.factorId.subfactorId".
 */
export function buildSubfactorList(json: unknown): SubfactorEntry[] {
	const j = json as any;
	const out: SubfactorEntry[] = [];
	if (!j || !Array.isArray(j.systems)) return out;

	for (const system of j.systems) {
		if (!system || !Array.isArray(system.factors)) continue;
		const systemId = system.id;
		for (const factor of system.factors) {
			if (!factor) continue;
			const factorId = factor.id;
			const subs = Array.isArray(factor.sub_factors) ? factor.sub_factors : [];
			for (const sub of subs) {
				if (!sub || !Array.isArray(sub.indicators)) continue;
				const codes = extractMetricCodes(sub.indicators);
				if (codes.length === 0) continue;
				const flatMetrics = sub.indicators.flatMap((ind: any) => ind?.metrics ?? []);
				out.push({
					path: `${systemId}.${factorId}.${sub.id}`,
					codes,
					groups: buildThresholdGroups(flatMetrics)
				});
			}
		}
	}

	return out;
}

/** Find metadata for a system by id. Returns `{ systemId, raw, system_label }` or null. */
export function getSystemMetadata(json: unknown, systemId: string): Record<string, any> | null {
	const j = json as any;
	if (!j || !Array.isArray(j.systems) || !systemId) return null;
	for (const system of j.systems) {
		if (system?.id === systemId) {
			return { systemId: system.id, raw: system, system_label: system.label ?? null };
		}
	}
	return null;
}

/** Find metadata for a factor by systemId + factorId. Returns `{ systemId, factorId, raw, factor_label }` or null. */
export function getFactorMetadata(
	json: unknown,
	systemId: string,
	factorId: string
): Record<string, any> | null {
	const j = json as any;
	if (!j || !Array.isArray(j.systems) || !systemId || !factorId) return null;
	for (const system of j.systems) {
		if (!system || system.id !== systemId) continue;
		for (const factor of (Array.isArray(system.factors) ? system.factors : [])) {
			if (factor?.id === factorId) {
				return { systemId, factorId: factor.id, raw: factor, factor_label: factor.label ?? null };
			}
		}
	}
	return null;
}

/** Find metadata for a subfactor. Returns `{ systemId, factorId, subfactorId, raw, subfactor_label }` or null. */
export function getSubFactorMetadata(
	json: unknown,
	systemId: string,
	factorId: string,
	subfactorId: string
): Record<string, any> | null {
	const j = json as any;
	if (!j || !Array.isArray(j.systems) || !systemId || !factorId || !subfactorId) return null;
	for (const system of j.systems) {
		if (!system || system.id !== systemId) continue;
		for (const factor of (Array.isArray(system.factors) ? system.factors : [])) {
			if (!factor || factor.id !== factorId) continue;
			for (const sub of (Array.isArray(factor.sub_factors) ? factor.sub_factors : [])) {
				if (sub?.id === subfactorId) {
					return { systemId, factorId, subfactorId: sub.id, raw: sub, subfactor_label: sub.label ?? null };
				}
			}
		}
	}
	return null;
}

/* --------------------- Table helpers --------------------- */

export const REFERENCE_TABLE_COLUMNS = [
	'system',
	'factor',
	'subfactor',
	'indicator',
	'metric',
	'label',
	'level',
	'risk_concept',
	'evidence_type',
	'type',
	'preference',
	'evidence_threshold',
	'factor_threshold',
	'above_or_below',
	'threshold_an',
	'threshold_van',
	'references_for_threshold',
	'usual_data_sources',
	'msna_module',
	'question_kobo_code',
	'remarks_limitations'
] as const;

/**
 * Flatten the full reference JSON into a plain array of objects ready for DataTable.
 * Each metric leaf becomes one row; system/factor/subfactor/indicator labels are
 * carried as context columns. `thresholds.an` and `thresholds.van` are promoted to
 * top-level keys. Null/undefined values become empty strings.
 */
export function buildReferenceRows(json: unknown): Record<string, string>[] {
	const out: Record<string, string>[] = [];

	const j = json as any;
	if (!j || !Array.isArray(j.systems)) return out;

	const str = (v: unknown): string => (v == null ? '' : String(v));

	for (const system of j.systems) {
		if (!system) continue;
		const systemLabel = str(system.label);
		for (const factor of Array.isArray(system.factors) ? system.factors : []) {
			if (!factor) continue;
			const factorLabel = str(factor.label);
			for (const sub of Array.isArray(factor.sub_factors) ? factor.sub_factors : []) {
				if (!sub || !Array.isArray(sub.indicators)) continue;
				const subfactorLabel = str(sub.label);
				for (const ind of sub.indicators) {
					if (!ind || !Array.isArray(ind.metrics)) continue;
					const indicatorLabel = str(ind.label);
					for (const m of ind.metrics) {
						if (!m || typeof m.metric !== 'string') continue;
						const t = m.thresholds ?? {};
						out.push({
							system: systemLabel,
							factor: factorLabel,
							subfactor: subfactorLabel,
							indicator: indicatorLabel,
							metric: str(m.metric),
							label: str(m.label),
							level: str(m.level),
							risk_concept: str(m.risk_concept),
							evidence_type: str(m.evidence_type),
							type: str(m.type),
							preference: str(m.preference),
							evidence_threshold: str(m.evidence_threshold),
							factor_threshold: str(m.factor_threshold),
							above_or_below: str(m.above_or_below),
							threshold_an: str(t.an),
							threshold_van: str(t.van),
							references_for_threshold: str(m.references_for_threshold),
							usual_data_sources: str(m.usual_data_sources),
							msna_module: str(m.msna_module),
							msna_indicator: str(m.msna_indicator),
							question_kobo_code: str(m.question_kobo_code),
							remarks_limitations: str(m.remarks_limitations)
						});
					}
				}
			}
		}
	}

	return out;
}

/**
 * Find metadata for a single metric by MET id.
 * Returns `{ metric, label, raw, systemId, factorId, subfactorId, indicatorId }` or null.
 */
export function getMetricMetadata(json: unknown, metricId: string): Record<string, any> | null {
	const j = json as any;
	if (!metricId || !j || !Array.isArray(j.systems)) return null;

	for (const system of j.systems) {
		if (!system || !Array.isArray(system.factors)) continue;
		const systemId = system.id;
		for (const factor of system.factors) {
			if (!factor) continue;
			const factorId = factor.id;
			const subs = Array.isArray(factor.sub_factors) ? factor.sub_factors : [];
			for (const sub of subs) {
				if (!sub || !Array.isArray(sub.indicators)) continue;
				for (const ind of sub.indicators) {
					if (!ind || !Array.isArray(ind.metrics)) continue;
					for (const m of ind.metrics) {
						if (!m || typeof m.metric !== 'string') continue;
						if (m.metric === metricId) {
							return {
								metric: m.metric,
								label: m.label ?? null,
								evidence_type: m.evidence_type ?? null,
								raw: m,
								systemId,
								factorId,
								subfactorId: sub.id,
								indicatorId: ind.id
							};
						}
					}
				}
			}
		}
	}

	return null;
}

/**
 * Find metadata for an indicator concept by its snake_case id.
 * Returns `{ indicatorId, label, systemId, factorId, subfactorId, raw }` or null.
 * Useful for deepdive views that group metrics under their parent indicator concept.
 */
export function getIndicatorMetadata(
	json: unknown,
	indicatorId: string
): Record<string, any> | null {
	const j = json as any;
	if (!indicatorId || !j || !Array.isArray(j.systems)) return null;

	for (const system of j.systems) {
		if (!system || !Array.isArray(system.factors)) continue;
		const systemId = system.id;
		for (const factor of system.factors) {
			if (!factor) continue;
			const factorId = factor.id;
			const subs = Array.isArray(factor.sub_factors) ? factor.sub_factors : [];
			for (const sub of subs) {
				if (!sub || !Array.isArray(sub.indicators)) continue;
				for (const ind of sub.indicators) {
					if (!ind) continue;
					if (ind.id === indicatorId) {
						return {
							indicatorId: ind.id,
							label: ind.label ?? null,
							systemId,
							factorId,
							subfactorId: sub.id,
							raw: ind
						};
					}
				}
			}
		}
	}

	return null;
}
