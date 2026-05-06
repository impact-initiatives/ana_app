/**
 * referenceMerger.ts
 *
 * Merges custom RefRow[] (from referenceBuilder) into a base reference.json clone.
 *
 * Rules:
 *   - System / Factor / Sub-Factor must already exist in the base (pre-validated)
 *   - MET_ID found  → update non-empty fields in-place
 *   - MET_ID absent → find-or-create Indicator under existing Sub-Factor; append metric
 *   - Post-merge: Zod validation on the merged root (structural check)
 *
 * Returns:
 *   { mergedJson, mergedMetricMap, stats, zodErrors }
 *   zodErrors is empty when the merged JSON passes structural validation.
 */

import type { Metric, ReferenceRoot } from '$lib/types/structure';
import type { MetricMap } from '$lib/engine/validator';
import { toSnakeCase, type RefRow } from '$lib/engine/referenceBuilder';
import { safeValidateReferenceRoot, formatZodErrors } from '$lib/types/reference-json';

// ── Public types ──────────────────────────────────────────────────────────────

export interface MergeStats {
	updated: string[];
	added: string[];
	unchanged: number;
}

// ── Internal helpers (mirror generate script, no fs/Node deps) ────────────────

const roundThreshold = (raw: string): number | null => {
	const s = raw.trim();
	if (s === '' || s.toUpperCase() === 'NA') return null;
	const n = parseFloat(s);
	return isNaN(n) ? null : Number(n.toPrecision(10));
};

const parseInteger = (raw: string): number => {
	const n = parseInt(raw.trim(), 10);
	return isNaN(n) ? 0 : n;
};

const nullIfEmpty = (s: string): string | null => {
	const t = s.trim();
	return t === '' ? null : t;
};

const nullIfNA = (s: string): string | null => {
	const t = s.trim();
	return t === '' || t.toUpperCase() === 'NA' ? null : t;
};

// ── flattenMetrics (mirrors metricStore, kept local to avoid circular dep) ────

function flattenMetrics(json: unknown): MetricMap {
	const map: MetricMap = Object.create(null);
	if (!json || typeof json !== 'object') return map;
	const j = json as Record<string, unknown>;
	if (!Array.isArray(j['systems'])) return map;

	for (const system of j['systems']) {
		if (!system || typeof system !== 'object') continue;
		const factors = (system as Record<string, unknown>)['factors'];
		if (!Array.isArray(factors)) continue;
		for (const factor of factors) {
			if (!factor || typeof factor !== 'object') continue;
			const subs = (factor as Record<string, unknown>)['sub_factors'];
			if (!Array.isArray(subs)) continue;
			for (const sub of subs) {
				if (!sub || typeof sub !== 'object') continue;
				const inds = (sub as Record<string, unknown>)['indicators'];
				if (!Array.isArray(inds)) continue;
				for (const ind of inds) {
					if (!ind || typeof ind !== 'object') continue;
					const metrics = (ind as Record<string, unknown>)['metrics'];
					if (!Array.isArray(metrics)) continue;
					for (const met of metrics) {
						if (!met || typeof met !== 'object') continue;
						const m = met as Record<string, unknown>;
						if (!m['metric']) continue;
						const key = String(m['metric']).trim().toUpperCase();
						if (key) map[key] = met as Metric;
					}
				}
			}
		}
	}

	return map;
}

// ── Row → Metric object conversion ───────────────────────────────────────────

function rowToMetric(row: RefRow): Metric {
	const rawType = row['Type']?.trim() ?? '';
	return {
		metric: row['MET_ID'].trim(),
		label: nullIfEmpty(row['Metric'] ?? ''),
		level: nullIfEmpty(row['Level'] ?? ''),
		preference: parseInteger(row['Preference'] ?? ''),
		type: rawType === '' ? null : rawType,
		msna_module: nullIfEmpty(row['MSNA module'] ?? ''),
		msna_indicator: nullIfEmpty(row['MSNA indicator'] ?? ''),
		question_kobo_code: nullIfEmpty(row['Question KOBO Code'] ?? ''),
		remarks_limitations: nullIfEmpty(row['Remarks/Limitations'] ?? ''),
		thresholds: {
			an: roundThreshold(row['Acute needs threshold (4)'] ?? ''),
			van: roundThreshold(row['Very acute needs threshold (5)'] ?? '')
		},
		above_or_below: (row['Above or below'] ?? '').trim(),
		evidence_threshold: parseInteger(row['Evidence threshold'] ?? ''),
		factor_threshold: parseInteger(row['Factor threshold'] ?? ''),
		risk_concept: nullIfNA(row['Risk concept'] ?? '')
	};
}

// ── Merge ─────────────────────────────────────────────────────────────────────

/**
 * Merge custom rows into a deep clone of baseJson.
 *
 * Pre-condition: rows have already been validated with validateRefRows().
 * System/Factor/Sub-Factor are guaranteed to exist; this function does not
 * re-validate — it just applies the changes.
 */
export function mergeCustomRows(
	baseJson: Record<string, unknown>,
	customRows: RefRow[]
): { mergedJson: Record<string, unknown>; mergedMetricMap: MetricMap; stats: MergeStats; zodErrors: string[] } {
	const merged = structuredClone(baseJson) as unknown as ReferenceRoot;
	const stats: MergeStats = { updated: [], added: [], unchanged: 0 };

	// Build a flat map: MET_ID → Metric (reference into the cloned tree)
	const metMap = flattenMetrics(merged as unknown);

	for (const row of customRows) {
		const id = row['MET_ID'].trim();
		const existing = metMap[id.toUpperCase()];

		if (existing) {
			// Update non-empty fields in-place
			let changed = false;

			const newLabel = nullIfEmpty(row['Metric'] ?? '');
			if (newLabel !== null && newLabel !== existing.label) { existing.label = newLabel; changed = true; }

			const newLevel = nullIfEmpty(row['Level'] ?? '');
			if (newLevel !== null && newLevel !== existing.level) { existing.level = newLevel; changed = true; }

			const newPref = parseInteger(row['Preference'] ?? '');
			if (row['Preference'].trim() !== '' && newPref !== existing.preference) { existing.preference = newPref; changed = true; }

			const rawType = row['Type']?.trim() ?? '';
			const newType = rawType === '' ? null : rawType;
			if (rawType !== '' && newType !== existing.type) { existing.type = newType; changed = true; }

			const newAob = row['Above or below']?.trim() ?? '';
			if (newAob !== '' && newAob !== existing.above_or_below) { existing.above_or_below = newAob; changed = true; }

			const newAn = roundThreshold(row['Acute needs threshold (4)'] ?? '');
			if (row['Acute needs threshold (4)'].trim() !== '' && newAn !== existing.thresholds.an) { existing.thresholds.an = newAn; changed = true; }

			const vanRaw = row['Very acute needs threshold (5)'] ?? '';
			if (vanRaw.trim() !== '') {
				const newVan = roundThreshold(vanRaw);
				if (newVan !== (existing.thresholds.van ?? null)) { existing.thresholds.van = newVan ?? undefined; changed = true; }
			}

			const newEv = row['Evidence threshold'].trim() !== '' ? parseInteger(row['Evidence threshold'] ?? '') : null;
			if (newEv !== null && newEv !== existing.evidence_threshold) { existing.evidence_threshold = newEv; changed = true; }

			const newFt = row['Factor threshold'].trim() !== '' ? parseInteger(row['Factor threshold'] ?? '') : null;
			if (newFt !== null && newFt !== existing.factor_threshold) { existing.factor_threshold = newFt; changed = true; }

			const newRc = nullIfNA(row['Risk concept'] ?? '');
			if (row['Risk concept']?.trim() !== '' && newRc !== (existing.risk_concept ?? null)) { existing.risk_concept = newRc; changed = true; }

			const newMsnaModule = nullIfEmpty(row['MSNA module'] ?? '');
			if (newMsnaModule !== null && newMsnaModule !== (existing.msna_module ?? null)) { existing.msna_module = newMsnaModule; changed = true; }

			const newMsnaInd = nullIfEmpty(row['MSNA indicator'] ?? '');
			if (newMsnaInd !== null && newMsnaInd !== (existing.msna_indicator ?? null)) { existing.msna_indicator = newMsnaInd; changed = true; }

			const newKobo = nullIfEmpty(row['Question KOBO Code'] ?? '');
			if (newKobo !== null && newKobo !== (existing.question_kobo_code ?? null)) { existing.question_kobo_code = newKobo; changed = true; }

			const newRem = nullIfEmpty(row['Remarks/Limitations'] ?? '');
			if (newRem !== null && newRem !== (existing.remarks_limitations ?? null)) { existing.remarks_limitations = newRem; changed = true; }

			if (changed) stats.updated.push(id);
			else stats.unchanged++;
		} else {
			// New metric — append to existing sys → fac → sf → (find-or-create) indicator
			const sysId = toSnakeCase(row['System'] ?? '');
			const facId = toSnakeCase(row['Factor'] ?? '');
			const sfId = toSnakeCase(row['Sub-Factor'] ?? '');
			const indId = toSnakeCase(row['Indicator'] ?? '');
			const indLabel = (row['Indicator'] ?? '').trim();

			const sys = merged.systems.find((s) => s.id === sysId);
			if (!sys) continue; // pre-validated — should not happen
			const fac = sys.factors.find((f) => f.id === facId);
			if (!fac) continue;
			const sf = fac.sub_factors.find((s) => s.id === sfId);
			if (!sf) continue;

			let ind = sf.indicators.find((i) => i.id === indId);
			if (!ind) {
				ind = { id: indId, label: indLabel || null, metrics: [] };
				sf.indicators.push(ind);
			}

			const newMetric = rowToMetric(row);
			ind.metrics.push(newMetric);
			// Update flat map so subsequent rows in same upload see the new metric
			metMap[id.toUpperCase()] = newMetric;
			stats.added.push(id);
		}
	}

	// Post-merge Zod validation
	const zodResult = safeValidateReferenceRoot(merged);
	const zodErrors = zodResult.success ? [] : formatZodErrors(zodResult.error);

	const mergedJson = merged as unknown as Record<string, unknown>;
	const mergedMetricMap = flattenMetrics(mergedJson);

	return { mergedJson, mergedMetricMap, stats, zodErrors };
}
