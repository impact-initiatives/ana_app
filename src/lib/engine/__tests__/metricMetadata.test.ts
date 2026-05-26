import { describe, it, expect } from 'vitest';
import {
	getAllMetricIds,
	getMetricIdsForPath,
	buildSubfactorList,
	getSystemMetadata,
	getFactorMetadata,
	getSubFactorMetadata,
	getMetricMetadata,
	getIndicatorMetadata,
	buildReferenceRows,
	REFERENCE_TABLE_COLUMNS
} from '$lib/engine/metricMetadata';
import refJson from './fixtures/reference-mini.json';

describe('getAllMetricIds', () => {
	it('returns all metric ids in encounter order', () => {
		const ids = getAllMetricIds(refJson);
		expect(ids).toEqual(['MET001', 'MET002', 'MET003', 'MET004', 'MET013', 'MET005', 'MET011', 'MET012', 'MET014', 'MET007', 'MET009', 'MET010', 'MET008', 'MET006']);
	});

	it('returns empty array for null or missing systems', () => {
		expect(getAllMetricIds(null)).toEqual([]);
		expect(getAllMetricIds({})).toEqual([]);
	});

	it('deduplicates ids that appear twice', () => {
		const dup = {
			systems: [
				{
					id: 'sys',
					factors: [
						{
							id: 'fac',
							sub_factors: [
								{
									id: 'sf',
									indicators: [
										{ id: 'ind', metrics: [{ metric: 'MET001' }, { metric: 'MET001' }] }
									]
								}
							]
						}
					]
				}
			]
		};
		expect(getAllMetricIds(dup)).toEqual(['MET001']);
	});
});

describe('getMetricIdsForPath', () => {
	it('returns metric ids for a known path', () => {
		const ids = getMetricIdsForPath(
			refJson,
			'food_security',
			'food_consumption',
			'food_consumption_fcs'
		);
		expect(ids).toEqual(['MET003', 'MET004', 'MET013']);
	});

	it('returns empty array for an unknown path', () => {
		expect(getMetricIdsForPath(refJson, 'missing', 'fac', 'sf')).toEqual([]);
	});

	it('returns empty array when any segment is empty', () => {
		expect(getMetricIdsForPath(refJson, '', 'food_consumption', 'food_consumption_fcs')).toEqual(
			[]
		);
	});
});

describe('buildSubfactorList', () => {
	it('builds entries for each subfactor that has metrics', () => {
		const list = buildSubfactorList(refJson);
		const paths = list.map((e) => e.path);
		expect(paths).toContain('mortality.mortality_rate.mortality_rate_cdr');
		expect(paths).toContain('food_security.food_consumption.food_consumption_fcs');
	});

	it('each entry has codes and groups', () => {
		const list = buildSubfactorList(refJson);
		const cdr = list.find((e) => e.path === 'mortality.mortality_rate.mortality_rate_cdr')!;
		expect(cdr.codes).toEqual(['MET001', 'MET002']);
		expect(cdr.groups.length).toBeGreaterThanOrEqual(1);
	});

	it('groups metrics by (factor_threshold, evidence_threshold)', () => {
		const list = buildSubfactorList(refJson);
		const fcs = list.find((e) => e.path === 'food_security.food_consumption.food_consumption_fcs')!;
		// MET003 and MET004 share (ft=1, et=2) → 1 group; MET013 has (ft=1, et=1) → separate group
		expect(fcs.groups).toHaveLength(2);
		const g1 = fcs.groups.find((g) => g.evidence_threshold === 2)!;
		expect(g1.codes).toEqual(['MET003', 'MET004']);
		const g2 = fcs.groups.find((g) => g.evidence_threshold === 1)!;
		expect(g2.codes).toEqual(['MET013']);
	});
});

describe('getSystemMetadata', () => {
	it('returns system metadata for a known id', () => {
		const meta = getSystemMetadata(refJson, 'mortality');
		expect(meta).not.toBeNull();
		expect(meta!.systemId).toBe('mortality');
		expect(meta!.system_label).toBe('Mortality');
	});

	it('returns null for an unknown id', () => {
		expect(getSystemMetadata(refJson, 'unknown')).toBeNull();
	});
});

describe('getFactorMetadata', () => {
	it('returns factor metadata for a known path', () => {
		const meta = getFactorMetadata(refJson, 'food_security', 'food_consumption');
		expect(meta).not.toBeNull();
		expect(meta!.factorId).toBe('food_consumption');
		expect(meta!.factor_label).toBe('Food Consumption');
	});

	it('returns null for mismatched system', () => {
		expect(getFactorMetadata(refJson, 'mortality', 'food_consumption')).toBeNull();
	});
});

describe('getSubFactorMetadata', () => {
	it('returns subfactor metadata for a known path', () => {
		const meta = getSubFactorMetadata(
			refJson,
			'mortality',
			'mortality_rate',
			'mortality_rate_cdr'
		);
		expect(meta).not.toBeNull();
		expect(meta!.subfactorId).toBe('mortality_rate_cdr');
	});

	it('returns null for wrong subfactor id', () => {
		expect(getSubFactorMetadata(refJson, 'mortality', 'mortality_rate', 'wrong')).toBeNull();
	});
});

describe('getMetricMetadata', () => {
	it('returns full metadata for a known metric id', () => {
		const meta = getMetricMetadata(refJson, 'MET003');
		expect(meta).not.toBeNull();
		expect(meta!.metric).toBe('MET003');
		expect(meta!.systemId).toBe('food_security');
		expect(meta!.factorId).toBe('food_consumption');
		expect(meta!.subfactorId).toBe('food_consumption_fcs');
		expect(meta!.indicatorId).toBe('fcs');
	});

	it('returns null for an unknown metric', () => {
		expect(getMetricMetadata(refJson, 'MET999')).toBeNull();
	});

	it('returns null for empty metric id', () => {
		expect(getMetricMetadata(refJson, '')).toBeNull();
	});
});

describe('getIndicatorMetadata', () => {
	it('returns indicator metadata for a known id', () => {
		const meta = getIndicatorMetadata(refJson, 'cdr');
		expect(meta).not.toBeNull();
		expect(meta!.indicatorId).toBe('cdr');
		expect(meta!.systemId).toBe('mortality');
	});

	it('returns null for an unknown indicator', () => {
		expect(getIndicatorMetadata(refJson, 'unknown')).toBeNull();
	});
});

describe('buildReferenceRows', () => {
	it('returns one row per metric leaf', () => {
		const rows = buildReferenceRows(refJson);
		// 14 metrics total in fixture: MET001–MET014 (MET006 preference-3 reference-only, still emitted)
		expect(rows).toHaveLength(14);
	});

	it('each row has all REFERENCE_TABLE_COLUMNS keys', () => {
		const rows = buildReferenceRows(refJson);
		for (const row of rows) {
			for (const col of REFERENCE_TABLE_COLUMNS) {
				expect(row).toHaveProperty(col);
			}
		}
	});

	it('carries system/factor/subfactor/indicator labels as context', () => {
		const rows = buildReferenceRows(refJson);
		const met001 = rows.find((r) => r.metric === 'MET001')!;
		expect(met001.system).toBe('Mortality');
		expect(met001.factor).toBe('Mortality Rate');
		expect(met001.subfactor).toBe('Crude Death Rate');
		expect(met001.indicator).toBe('CDR');
	});

	it('promotes thresholds.an and thresholds.van to top-level keys', () => {
		const rows = buildReferenceRows(refJson);
		const met001 = rows.find((r) => r.metric === 'MET001')!;
		expect(met001.threshold_an).toBe('0.5');
		expect(met001.threshold_van).toBe('1');
	});

	it('returns empty array for invalid input', () => {
		expect(buildReferenceRows(null)).toEqual([]);
		expect(buildReferenceRows({})).toEqual([]);
	});
});
