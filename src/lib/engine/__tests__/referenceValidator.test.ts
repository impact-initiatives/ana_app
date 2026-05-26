import { describe, it, expect } from 'vitest';
import {
	checkDuplicateIDs,
	checkThresholdValues,
	checkVanOrdering,
	checkVanPresence,
	checkRequiredSystems,
	validateMergedJson
} from '$lib/engine/referenceValidator';
import baseJson from './fixtures/reference-mini-valid.json';

// ── Helpers ───────────────────────────────────────────────────────────────────

function deepClone<T>(v: T): T {
	return JSON.parse(JSON.stringify(v));
}

/** Set a metric field by MET_ID deep inside the JSON tree */
function patchMetric(
	json: Record<string, unknown>,
	metricId: string,
	patch: Record<string, unknown>
): void {
	const root = json as {
		systems: Array<{
			factors: Array<{ sub_factors: Array<{ indicators: Array<{ metrics: Array<Record<string, unknown>> }> }> }>;
		}>;
	};
	for (const sys of root.systems) {
		for (const fac of sys.factors) {
			for (const sf of fac.sub_factors) {
				for (const ind of sf.indicators) {
					const m = ind.metrics.find((m) => m['metric'] === metricId);
					if (m) Object.assign(m, patch);
				}
			}
		}
	}
}

// ── Pass 5 — checkDuplicateIDs ────────────────────────────────────────────────

describe('checkDuplicateIDs — valid fixture', () => {
	it('returns no errors for a well-formed reference', () => {
		const { errors, warnings } = checkDuplicateIDs(baseJson);
		expect(errors).toHaveLength(0);
		expect(warnings).toHaveLength(0);
	});
});

describe('checkDuplicateIDs — invalid_format', () => {
	it('errors when a metric has an empty metric ID', () => {
		const json = deepClone(baseJson) as Record<string, unknown>;
		patchMetric(json, 'MET001', { metric: '' });
		const { errors } = checkDuplicateIDs(json);
		const invalid = errors.filter((e) => e.kind === 'invalid_format');
		expect(invalid).toHaveLength(1);
		expect(invalid[0].id).toBe('');
	});

	it('errors when a metric ID does not match MET + 3 digits (e.g. "NEW")', () => {
		const json = deepClone(baseJson) as Record<string, unknown>;
		patchMetric(json, 'MET001', { metric: 'NEW' });
		const { errors } = checkDuplicateIDs(json);
		const invalid = errors.filter((e) => e.kind === 'invalid_format' && e.id === 'NEW');
		expect(invalid).toHaveLength(1);
	});

	it('errors when a metric ID is only digits (no MET prefix)', () => {
		const json = deepClone(baseJson) as Record<string, unknown>;
		patchMetric(json, 'MET001', { metric: '001' });
		const { errors } = checkDuplicateIDs(json);
		expect(errors.some((e) => e.kind === 'invalid_format' && e.id === '001')).toBe(true);
	});
});

describe('checkDuplicateIDs — duplicate metric IDs', () => {
	it('errors when two metrics share the same MET_ID', () => {
		const json = deepClone(baseJson) as Record<string, unknown>;
		patchMetric(json, 'MET002', { metric: 'MET001' });
		const { errors } = checkDuplicateIDs(json);
		const dup = errors.find((e) => e.kind === 'metric' && e.id === 'MET001');
		expect(dup).toBeDefined();
		expect(dup!.locations).toHaveLength(2);
	});
});

describe('checkDuplicateIDs — duplicate labels', () => {
	it('warns when two metrics share the same label', () => {
		const json = deepClone(baseJson) as Record<string, unknown>;
		patchMetric(json, 'MET002', { label: 'Deaths per 10,000 per day' }); // same as MET001
		const { warnings } = checkDuplicateIDs(json);
		expect(warnings).toHaveLength(1);
		expect(warnings[0].occurrences).toHaveLength(2);
	});
});

// ── Pass 4 — checkThresholdValues ─────────────────────────────────────────────

describe('checkThresholdValues', () => {
	it('returns no issues for valid fixture', () => {
		const { errors } = checkThresholdValues(baseJson);
		expect(errors).toHaveLength(0);
		// warnings may exist if fixture has unset thresholds — no assertion
	});

	it('warns when factor_threshold is null', () => {
		const json = deepClone(baseJson) as Record<string, unknown>;
		patchMetric(json, 'MET001', { factor_threshold: null });
		const { warnings } = checkThresholdValues(json);
		expect(warnings.some((w) => w.metric === 'MET001' && w.field === 'factor_threshold')).toBe(true);
	});

	it('errors when factor_threshold is 0', () => {
		const json = deepClone(baseJson) as Record<string, unknown>;
		patchMetric(json, 'MET001', { factor_threshold: 0 });
		const { errors } = checkThresholdValues(json);
		expect(errors.some((e) => e.metric === 'MET001' && e.field === 'factor_threshold')).toBe(true);
	});

	it('errors when factor_threshold is negative', () => {
		const json = deepClone(baseJson) as Record<string, unknown>;
		patchMetric(json, 'MET001', { factor_threshold: -1 });
		const { errors } = checkThresholdValues(json);
		expect(errors.some((e) => e.metric === 'MET001' && e.field === 'factor_threshold')).toBe(true);
	});

	it('skips preference-3 metrics', () => {
		const json = deepClone(baseJson) as Record<string, unknown>;
		patchMetric(json, 'MET001', { preference: 3, factor_threshold: null });
		const { warnings } = checkThresholdValues(json);
		expect(warnings.some((w) => w.metric === 'MET001')).toBe(false);
	});
});

// ── Pass 7 — checkVanOrdering ─────────────────────────────────────────────────

describe('checkVanOrdering', () => {
	it('returns no errors for valid fixture', () => {
		expect(checkVanOrdering(baseJson)).toHaveLength(0);
	});

	it('errors when VAN ≤ AN for Above direction', () => {
		const json = deepClone(baseJson) as Record<string, unknown>;
		patchMetric(json, 'MET001', { thresholds: { an: 2, van: 1 }, above_or_below: 'Above' });
		const errors = checkVanOrdering(json);
		expect(errors.some((e) => e.metric === 'MET001')).toBe(true);
	});

	it('errors when VAN ≥ AN for Below direction', () => {
		const json = deepClone(baseJson) as Record<string, unknown>;
		patchMetric(json, 'MET001', { thresholds: { an: 0.3, van: 0.5 }, above_or_below: 'Below' });
		const errors = checkVanOrdering(json);
		expect(errors.some((e) => e.metric === 'MET001')).toBe(true);
	});

	it('passes when VAN > AN for Above direction', () => {
		const json = deepClone(baseJson) as Record<string, unknown>;
		patchMetric(json, 'MET001', { thresholds: { an: 1, van: 2 }, above_or_below: 'Above' });
		expect(checkVanOrdering(json)).toHaveLength(0);
	});
});

// ── Pass 8 — checkVanPresence ─────────────────────────────────────────────────

describe('checkVanPresence', () => {
	it('returns no errors for valid fixture', () => {
		expect(checkVanPresence(baseJson)).toHaveLength(0);
	});

	it('errors when a non-supporting-evidence metric is missing VAN', () => {
		const json = deepClone(baseJson) as Record<string, unknown>;
		patchMetric(json, 'MET001', { thresholds: { an: 1 }, evidence_type: 'AN signal' });
		const errors = checkVanPresence(json);
		expect(errors.some((e) => e.metric === 'MET001')).toBe(true);
	});

	it('does not error for supporting evidence metrics missing VAN', () => {
		const json = deepClone(baseJson) as Record<string, unknown>;
		patchMetric(json, 'MET001', { thresholds: { an: 1 }, evidence_type: 'Supporting evidence' });
		expect(checkVanPresence(json)).toHaveLength(0);
	});

	it('does not error for preference-3 metrics missing VAN', () => {
		const json = deepClone(baseJson) as Record<string, unknown>;
		patchMetric(json, 'MET001', { preference: 3, thresholds: { an: 1 }, evidence_type: 'AN signal' });
		expect(checkVanPresence(json)).toHaveLength(0);
	});
});

// ── Pass 3 — checkRequiredSystems ────────────────────────────────────────────

describe('checkRequiredSystems', () => {
	it('returns no errors when mortality and health_outcomes are present', () => {
		expect(checkRequiredSystems(baseJson)).toHaveLength(0);
	});

	it('errors when mortality system is missing', () => {
		const json = deepClone(baseJson) as Record<string, unknown>;
		(json as { systems: Array<{ id: string }> }).systems = (
			json as { systems: Array<{ id: string }> }
		).systems.filter((s) => s.id !== 'mortality');
		const errors = checkRequiredSystems(json);
		expect(errors.some((e) => e.missingId === 'mortality')).toBe(true);
	});
});

// ── validateMergedJson — orchestrator ────────────────────────────────────────

describe('validateMergedJson', () => {
	it('returns no errors for valid fixture', () => {
		const { errors } = validateMergedJson(baseJson);
		expect(errors).toHaveLength(0);
	});

	it('reports Pass 5 error for empty metric ID', () => {
		const json = deepClone(baseJson) as Record<string, unknown>;
		patchMetric(json, 'MET001', { metric: '' });
		const { errors } = validateMergedJson(json);
		expect(errors.some((e) => e.includes('[Pass 5]') && e.includes('""'))).toBe(true);
	});

	it('reports Pass 5 error for non-MET metric ID', () => {
		const json = deepClone(baseJson) as Record<string, unknown>;
		patchMetric(json, 'MET001', { metric: 'NEW' });
		const { errors } = validateMergedJson(json);
		expect(errors.some((e) => e.includes('[Pass 5]') && e.includes('"NEW"'))).toBe(true);
	});

	it('reports Pass 8 error when VAN is missing', () => {
		const json = deepClone(baseJson) as Record<string, unknown>;
		patchMetric(json, 'MET001', { thresholds: { an: 1 }, evidence_type: 'AN signal' });
		const { errors } = validateMergedJson(json);
		expect(errors.some((e) => e.includes('[Pass 8]') && e.includes('MET001'))).toBe(true);
	});
});
