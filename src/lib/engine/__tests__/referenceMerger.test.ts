import { describe, it, expect } from 'vitest';
import { mergeCustomRows } from '$lib/engine/referenceMerger';
import type { RefRow } from '$lib/engine/referenceBuilder';
import baseJson from './fixtures/reference-mini-valid.json';

// ── Helpers ───────────────────────────────────────────────────────────────────

function row(overrides: Partial<Record<keyof RefRow, string>>): RefRow {
	return {
		MET_ID: 'MET001',
		System: 'Mortality',
		Factor: 'Mortality',
		'Sub-Factor': 'Mortality',
		Indicator: 'Crude mortality rate',
		Preference: '1',
		Type: 'num[0+]',
		Metric: 'Deaths per 10,000 per day',
		Level: 'Mortality outcome',
		'MSNA module': 'Mortality',
		'MSNA indicator': '',
		'Question KOBO Code': 'num_died',
		'Remarks/Limitations': '',
		'Acute needs threshold (4)': '1',
		'Very acute needs threshold (5)': '2',
		'Above or below': 'Above',
		'Evidence threshold': '1',
		'Factor threshold': '1',
		'Risk concept': '',
		...overrides
	} as RefRow;
}

function getMetric(result: Record<string, unknown>, id: string) {
	const root = result as {
		systems: Array<{
			factors: Array<{
				sub_factors: Array<{
					indicators: Array<{ metrics: Array<{ metric: string } & Record<string, unknown>> }>;
				}>;
			}>;
		}>;
	};
	for (const sys of root.systems) {
		for (const fac of sys.factors) {
			for (const sf of fac.sub_factors) {
				for (const ind of sf.indicators) {
					const m = ind.metrics.find((m) => m.metric === id);
					if (m) return m;
				}
			}
		}
	}
	return null;
}

// ── Update existing metric ────────────────────────────────────────────────────

describe('mergeCustomRows — update existing metric', () => {
	it('updates AN threshold when provided', () => {
		const { mergedJson, stats } = mergeCustomRows(baseJson as Record<string, unknown>, [
			row({ MET_ID: 'MET001', 'Acute needs threshold (4)': '0.75' })
		]);
		const met = getMetric(mergedJson, 'MET001') as { thresholds: { an: number } };
		expect(met?.thresholds.an).toBe(0.75);
		expect(stats.updated).toContain('MET001');
	});

	it('updates VAN threshold when provided', () => {
		const { mergedJson } = mergeCustomRows(baseJson as Record<string, unknown>, [
			row({ MET_ID: 'MET001', 'Very acute needs threshold (5)': '1.5' })
		]);
		const met = getMetric(mergedJson, 'MET001') as { thresholds: { van?: number } };
		expect(met?.thresholds.van).toBe(1.5);
	});

	it('does NOT overwrite threshold when field is empty', () => {
		const { mergedJson, stats } = mergeCustomRows(baseJson as Record<string, unknown>, [
			row({ MET_ID: 'MET001', 'Acute needs threshold (4)': '' })
		]);
		const met = getMetric(mergedJson, 'MET001') as { thresholds: { an: number } };
		// Original value from fixture is 1
		expect(met?.thresholds.an).toBe(1);
		expect(stats.unchanged).toBe(1);
	});

	it('counts unchanged when no field differs', () => {
		const { stats } = mergeCustomRows(baseJson as Record<string, unknown>, [
			row({ MET_ID: 'MET001' }) // all values identical to fixture
		]);
		expect(stats.updated).toHaveLength(0);
		expect(stats.unchanged).toBe(1);
	});

	it('updates label when provided', () => {
		const { mergedJson, stats } = mergeCustomRows(baseJson as Record<string, unknown>, [
			row({ MET_ID: 'MET001', Metric: 'Country-adjusted CDR' })
		]);
		const met = getMetric(mergedJson, 'MET001') as { label: string };
		expect(met?.label).toBe('Country-adjusted CDR');
		expect(stats.updated).toContain('MET001');
	});

	it('updates type when provided', () => {
		const { mergedJson } = mergeCustomRows(baseJson as Record<string, unknown>, [
			row({ MET_ID: 'MET001', Type: 'num[0:10]' })
		]);
		const met = getMetric(mergedJson, 'MET001') as { type: string };
		expect(met?.type).toBe('num[0:10]');
	});

	it('updates multiple metrics independently', () => {
		const { mergedJson, stats } = mergeCustomRows(baseJson as Record<string, unknown>, [
			row({ MET_ID: 'MET001', 'Acute needs threshold (4)': '0.5' }),
			row({ MET_ID: 'MET002', 'Acute needs threshold (4)': '1.5' })
		]);
		const m1 = getMetric(mergedJson, 'MET001') as { thresholds: { an: number } };
		const m2 = getMetric(mergedJson, 'MET002') as { thresholds: { an: number } };
		expect(m1?.thresholds.an).toBe(0.5);
		expect(m2?.thresholds.an).toBe(1.5);
		expect(stats.updated).toHaveLength(2);
	});

	it('does not modify the original baseJson (deep clone)', () => {
		const base = JSON.parse(JSON.stringify(baseJson));
		mergeCustomRows(base as Record<string, unknown>, [
			row({ MET_ID: 'MET001', 'Acute needs threshold (4)': '99' })
		]);
		// Original base should still have an=1
		const orig = getMetric(base as Record<string, unknown>, 'MET001') as { thresholds: { an: number } };
		expect(orig?.thresholds.an).toBe(1);
	});
});

// ── Add new metric ────────────────────────────────────────────────────────────

describe('mergeCustomRows — add new metric', () => {
	it('adds a new metric to an existing indicator', () => {
		const { mergedJson, stats } = mergeCustomRows(baseJson as Record<string, unknown>, [
			row({ MET_ID: 'MET099', Indicator: 'Crude mortality rate', Metric: 'New CDR metric' })
		]);
		const met = getMetric(mergedJson, 'MET099');
		expect(met).not.toBeNull();
		expect((met as { label?: string })?.label).toBe('New CDR metric');
		expect(stats.added).toContain('MET099');
	});

	it('creates a new indicator under an existing Sub-Factor for genuinely new MET_ID + indicator', () => {
		const { mergedJson, stats } = mergeCustomRows(baseJson as Record<string, unknown>, [
			row({ MET_ID: 'MET099', Indicator: 'Brand new indicator', Metric: 'Novel metric' })
		]);
		const met = getMetric(mergedJson, 'MET099');
		expect(met).not.toBeNull();
		expect(stats.added).toContain('MET099');
	});

	it('adds a new metric in a second system (health_outcomes)', () => {
		const { mergedJson, stats } = mergeCustomRows(baseJson as Record<string, unknown>, [
			row({
				MET_ID: 'MET099',
				System: 'Health outcomes',
				Factor: 'Nutrition status',
				'Sub-Factor': 'Acute Malnutrition',
				Indicator: 'GAM Prevalence',
				Type: 'num[0:1]',
				'Acute needs threshold (4)': '0.2'
			})
		]);
		const met = getMetric(mergedJson, 'MET099');
		expect(met).not.toBeNull();
		expect(stats.added).toContain('MET099');
	});

	it('new metric is immediately reachable in mergedMetricMap', () => {
		const { mergedMetricMap } = mergeCustomRows(baseJson as Record<string, unknown>, [
			row({ MET_ID: 'MET099', Indicator: 'Crude mortality rate', Metric: 'New' })
		]);
		expect(mergedMetricMap['MET099']).toBeDefined();
	});
});

// ── Stats ─────────────────────────────────────────────────────────────────────

describe('mergeCustomRows — stats', () => {
	it('stats.updated and stats.added are mutually exclusive', () => {
		const { stats } = mergeCustomRows(baseJson as Record<string, unknown>, [
			row({ MET_ID: 'MET001', 'Acute needs threshold (4)': '0.5' }), // update
			row({ MET_ID: 'MET099', Indicator: 'Crude mortality rate' }) // add
		]);
		expect(stats.updated).toContain('MET001');
		expect(stats.added).toContain('MET099');
		expect(stats.updated).not.toContain('MET099');
		expect(stats.added).not.toContain('MET001');
	});

	it('stats.unchanged counts rows with no field changes', () => {
		// Pass empty strings for all optional/value fields to avoid overwriting anything
		const noOverwrite = {
			Metric: '',
			Level: '',
			'MSNA module': '',
			'MSNA indicator': '',
			'Question KOBO Code': '',
			'Remarks/Limitations': '',
			'Acute needs threshold (4)': '',
			'Very acute needs threshold (5)': '',
			'Risk concept': ''
		};
		const { stats } = mergeCustomRows(baseJson as Record<string, unknown>, [
			row({ MET_ID: 'MET001', ...noOverwrite }),
			row({ MET_ID: 'MET002', ...noOverwrite })
		]);
		expect(stats.unchanged).toBe(2);
		expect(stats.updated).toHaveLength(0);
	});
});

// ── Zod validation ────────────────────────────────────────────────────────────

describe('mergeCustomRows — Zod post-merge validation', () => {
	it('returns no zodErrors for a valid merge', () => {
		const { zodErrors } = mergeCustomRows(baseJson as Record<string, unknown>, [
			row({ MET_ID: 'MET001', 'Acute needs threshold (4)': '0.75' })
		]);
		expect(zodErrors).toHaveLength(0);
	});

	it('returns no zodErrors when adding a new metric with valid data', () => {
		const { zodErrors } = mergeCustomRows(baseJson as Record<string, unknown>, [
			row({ MET_ID: 'MET099', Indicator: 'Crude mortality rate', Metric: 'New' })
		]);
		expect(zodErrors).toHaveLength(0);
	});
});
