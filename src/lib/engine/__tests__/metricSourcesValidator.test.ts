import { describe, it, expect } from 'vitest';
import {
	parseMetricSourcesCsv,
	validateMetricSourceRows,
	buildMetricSourcesMap
} from '$lib/engine/metricSourcesValidator';
import type { MetricSourceRow } from '$lib/types/sources';
import { getAllMetricIds } from '$lib/engine/metricMetadata';
import refJson from './fixtures/reference-mini.json';

// ── Helpers ────────────────────────────────────────────────────────────────────

function validRow(overrides: Partial<MetricSourceRow> = {}): MetricSourceRow {
	return {
		source: 'Survey A',
		link: '',
		metric_ids: 'MET001',
		uoa: '',
		start_of_data_collection: '2024-01-01',
		end_of_data_collection: '2024-06-30',
		...overrides
	};
}

function toCsv(rows: MetricSourceRow[]): string {
	const headers: (keyof MetricSourceRow)[] = [
		'source',
		'link',
		'metric_ids',
		'uoa',
		'start_of_data_collection',
		'end_of_data_collection'
	];
	const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
	return [
		headers.join(','),
		...rows.map((r) => headers.map((h) => esc(r[h])).join(','))
	].join('\n');
}

// Build a MetricMap from the mini fixture for validation tests
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const miniMetricMap: Record<string, any> = {};
for (const id of getAllMetricIds(refJson as Record<string, unknown>)) {
	miniMetricMap[id] = { label: id };
}

const TEST_UOAS = ['AF01', 'AF26', 'AF27', 'AF31'];

// ── parseMetricSourcesCsv ──────────────────────────────────────────────────────

describe('parseMetricSourcesCsv', () => {
	it('parses a valid CSV with all columns', () => {
		const csv = toCsv([validRow()]);
		const { rows, parseErrors } = parseMetricSourcesCsv(csv);
		expect(parseErrors).toHaveLength(0);
		expect(rows).toHaveLength(1);
		expect(rows[0].source).toBe('Survey A');
		expect(rows[0].metric_ids).toBe('MET001');
	});

	it('parses multiple rows', () => {
		const csv = toCsv([validRow(), validRow({ source: 'Admin Reg', metric_ids: 'MET002' })]);
		const { rows, parseErrors } = parseMetricSourcesCsv(csv);
		expect(parseErrors).toHaveLength(0);
		expect(rows).toHaveLength(2);
	});

	it('returns parseError when source column is missing', () => {
		const csv = 'metric_ids,uoa\nMET001,';
		const { rows, parseErrors } = parseMetricSourcesCsv(csv);
		expect(parseErrors.length).toBeGreaterThan(0);
		expect(parseErrors[0]).toMatch(/source/i);
		expect(rows).toHaveLength(0);
	});

	it('returns parseError when metric_ids column is missing', () => {
		const csv = 'source,uoa\nSurvey A,';
		const { rows, parseErrors } = parseMetricSourcesCsv(csv);
		expect(parseErrors.length).toBeGreaterThan(0);
		expect(parseErrors[0]).toMatch(/metric_ids/i);
		expect(rows).toHaveLength(0);
	});

	it('strips UTF-8 BOM', () => {
		const csv = '﻿' + toCsv([validRow()]);
		const { rows, parseErrors } = parseMetricSourcesCsv(csv);
		expect(parseErrors).toHaveLength(0);
		expect(rows).toHaveLength(1);
	});

	it('returns empty rows for header-only CSV', () => {
		const csv = 'source,link,metric_ids,uoa,start_of_data_collection,end_of_data_collection';
		const { rows, parseErrors } = parseMetricSourcesCsv(csv);
		expect(parseErrors).toHaveLength(0);
		expect(rows).toHaveLength(0);
	});
});

// ── validateMetricSourceRows ───────────────────────────────────────────────────

describe('validateMetricSourceRows — happy path', () => {
	it('returns no errors for a valid row', () => {
		const { errors, warnings } = validateMetricSourceRows(
			[validRow()],
			miniMetricMap,
			TEST_UOAS
		);
		expect(errors).toHaveLength(0);
		expect(warnings).toHaveLength(0);
	});

	it('accepts blank uoa (global scope)', () => {
		const { errors } = validateMetricSourceRows(
			[validRow({ uoa: '' })],
			miniMetricMap,
			TEST_UOAS
		);
		expect(errors).toHaveLength(0);
	});

	it('accepts valid UoA codes', () => {
		const { errors } = validateMetricSourceRows(
			[validRow({ uoa: 'AF26,AF27' })],
			miniMetricMap,
			TEST_UOAS
		);
		expect(errors).toHaveLength(0);
	});

	it('accepts multiple metric_ids', () => {
		const { errors } = validateMetricSourceRows(
			[validRow({ metric_ids: 'MET001,MET002,MET003' })],
			miniMetricMap,
			TEST_UOAS
		);
		expect(errors).toHaveLength(0);
	});
});

describe('validateMetricSourceRows — errors', () => {
	it('errors when source is empty', () => {
		const { errors } = validateMetricSourceRows(
			[validRow({ source: '' })],
			miniMetricMap,
			TEST_UOAS
		);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toMatch(/source/i);
	});

	it('errors when metric_id does not match format (too short)', () => {
		const { errors } = validateMetricSourceRows(
			[validRow({ metric_ids: 'MET01' })],
			miniMetricMap,
			TEST_UOAS
		);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toMatch(/MET01/);
	});

	it('errors when metric_id does not match format (wrong prefix)', () => {
		const { errors } = validateMetricSourceRows(
			[validRow({ metric_ids: 'FOO123' })],
			miniMetricMap,
			TEST_UOAS
		);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toMatch(/FOO123/);
	});

	it('errors when metric_id is valid format but absent from metricMap', () => {
		const { errors } = validateMetricSourceRows(
			[validRow({ metric_ids: 'MET999' })],
			miniMetricMap,
			TEST_UOAS
		);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toMatch(/MET999/);
	});

	it('errors when UoA code is not in flaggedUoas', () => {
		const { errors } = validateMetricSourceRows(
			[validRow({ uoa: 'XX99' })],
			miniMetricMap,
			TEST_UOAS
		);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toMatch(/XX99/);
	});

	it('errors on duplicate (metric_id, uoa) pair across rows', () => {
		const { errors } = validateMetricSourceRows(
			[validRow({ uoa: 'AF26' }), validRow({ source: 'Admin Reg', uoa: 'AF26' })],
			miniMetricMap,
			TEST_UOAS
		);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toMatch(/duplicate/i);
	});

	it('errors on duplicate global entries (both rows blank uoa, same metric_id)', () => {
		const { errors } = validateMetricSourceRows(
			[validRow({ uoa: '' }), validRow({ source: 'Admin Reg', uoa: '' })],
			miniMetricMap,
			TEST_UOAS
		);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toMatch(/duplicate/i);
	});
});

describe('validateMetricSourceRows — warnings', () => {
	it('warns on unparseable start_of_data_collection', () => {
		const { errors, warnings } = validateMetricSourceRows(
			[validRow({ start_of_data_collection: 'not-a-date' })],
			miniMetricMap,
			TEST_UOAS
		);
		expect(errors).toHaveLength(0);
		expect(warnings.length).toBeGreaterThan(0);
		expect(warnings[0]).toMatch(/start_of_data_collection/);
	});

	it('warns on unparseable end_of_data_collection', () => {
		const { errors, warnings } = validateMetricSourceRows(
			[validRow({ end_of_data_collection: 'Q3 2024' })],
			miniMetricMap,
			TEST_UOAS
		);
		expect(errors).toHaveLength(0);
		expect(warnings.length).toBeGreaterThan(0);
		expect(warnings[0]).toMatch(/end_of_data_collection/);
	});

	it('does not warn when dates are blank', () => {
		const { warnings } = validateMetricSourceRows(
			[validRow({ start_of_data_collection: '', end_of_data_collection: '' })],
			miniMetricMap,
			TEST_UOAS
		);
		expect(warnings).toHaveLength(0);
	});

	it('does not warn for parseable dates', () => {
		const { warnings } = validateMetricSourceRows(
			[validRow({ start_of_data_collection: '2024-01-01', end_of_data_collection: '2024-06-30' })],
			miniMetricMap,
			TEST_UOAS
		);
		expect(warnings).toHaveLength(0);
	});
});

// ── buildMetricSourcesMap ──────────────────────────────────────────────────────

describe('buildMetricSourcesMap', () => {
	it('creates a global key when uoa is blank', () => {
		const map = buildMetricSourcesMap([validRow({ uoa: '' })]);
		expect(map).toHaveProperty('MET001');
		expect(map['MET001'].source).toBe('Survey A');
	});

	it('creates UoA-specific keys when uoa is set', () => {
		const map = buildMetricSourcesMap([validRow({ uoa: 'AF26,AF27' })]);
		expect(map).toHaveProperty('MET001__AF26');
		expect(map).toHaveProperty('MET001__AF27');
		expect(map).not.toHaveProperty('MET001');
	});

	it('creates one entry per metric_id for multiple ids', () => {
		const map = buildMetricSourcesMap([validRow({ metric_ids: 'MET001,MET002,MET003', uoa: '' })]);
		expect(map).toHaveProperty('MET001');
		expect(map).toHaveProperty('MET002');
		expect(map).toHaveProperty('MET003');
	});

	it('preserves the link field', () => {
		const map = buildMetricSourcesMap([validRow({ link: 'https://example.com/survey' })]);
		expect(map['MET001'].link).toBe('https://example.com/survey');
	});

	it('preserves empty string link (not coerced to null)', () => {
		const map = buildMetricSourcesMap([validRow({ link: '' })]);
		expect(map['MET001'].link).toBe('');
	});

	it('maps start/end dates to camelCase fields', () => {
		const map = buildMetricSourcesMap([
			validRow({ start_of_data_collection: '2024-01-01', end_of_data_collection: '2024-06-30' })
		]);
		expect(map['MET001'].startOfDataCollection).toBe('2024-01-01');
		expect(map['MET001'].endOfDataCollection).toBe('2024-06-30');
	});

	it('returns empty map for empty rows', () => {
		const map = buildMetricSourcesMap([]);
		expect(Object.keys(map)).toHaveLength(0);
	});
});
