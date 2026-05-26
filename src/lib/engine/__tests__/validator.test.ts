import { describe, it, expect } from 'vitest';
import { validateCsv, type MetricMap } from '$lib/engine/dataValidator';

// MetricMap is Record<string, Metric> — use plain object, not Map
const metricMap: MetricMap = {
	MET001: {
		metric: 'MET001',
		label: 'CDR',
		preference: 1,
		type: 'num[0+]',
		thresholds: { an: 0.5, van: 1.0 },
		above_or_below: 'Above',
		evidence_threshold: 1,
		factor_threshold: 1
	} as any,
	MET002: {
		metric: 'MET002',
		label: 'U5DR',
		preference: 1,
		type: 'num[0+]',
		thresholds: { an: 2, van: 4 },
		above_or_below: 'Above',
		evidence_threshold: 1,
		factor_threshold: 1
	} as any,
	MET003: {
		metric: 'MET003',
		label: 'FCS Poor',
		preference: 1,
		type: 'num[0:1]',
		thresholds: { an: 0.2, van: 0.35 },
		above_or_below: 'Above',
		evidence_threshold: 2,
		factor_threshold: 1
	} as any
};

const validHeader = ['uoa', 'MET001', 'MET002', 'MET003'];
const validRows: string[][] = [
	['Area_A', '0.6', '3', '0.25'],
	['Area_B', '0.3', '1', '0.1']
];

describe('validateCsv — happy path', () => {
	it('returns ok=true for valid header and rows', () => {
		const result = validateCsv(validHeader, validRows, metricMap);
		expect(result.ok).toBe(true);
	});

	it('produces numericObjects with correct uoa values', () => {
		const result = validateCsv(validHeader, validRows, metricMap);
		expect(result.numericObjects).toHaveLength(2);
		expect(result.numericObjects![0]!.uoa).toBe('Area_A');
	});

	it('converts metric string cells to numbers in numericObjects', () => {
		const result = validateCsv(validHeader, validRows, metricMap);
		expect(result.numericObjects![0]!['MET001']).toBe(0.6);
	});

	it('returns null numericObjects for non-convertible cells', () => {
		const result = validateCsv(
			validHeader,
			[['Area_A', 'bad', '3', '0.25']],
			metricMap
		);
		// cellErrors triggered; numericObjects is null when conversion fails
		expect(result.numericObjects).toBeNull();
	});
});

describe('validateCsv — missing uoa column', () => {
	it('returns ok=false when uoa column is absent', () => {
		const result = validateCsv(['MET001', 'MET002'], [['0.6', '3']], metricMap);
		expect(result.ok).toBe(false);
		expect(result.headerErrors.some((e) => /uoa/i.test(e))).toBe(true);
	});
});

describe('validateCsv — no metric columns', () => {
	it('returns ok=true with no metric errors when no known metric columns exist', () => {
		// Validator does not error on unknown columns — only on uoa absence and cell errors
		const result = validateCsv(['uoa', 'unknown_col'], [['Area_A', '1']], metricMap);
		expect(result.ok).toBe(true);
		expect(result.numericObjects![0]!.uoa).toBe('Area_A');
	});
});

describe('validateCsv — duplicate UOAs', () => {
	it('records duplicate uoas in duplicateUoas array', () => {
		const rows: string[][] = [
			['Area_A', '0.6', '3', '0.25'],
			['Area_A', '0.3', '1', '0.1']
		];
		const result = validateCsv(validHeader, rows, metricMap);
		expect(result.duplicateUoas).toHaveLength(1);
		expect(result.duplicateUoas[0]!.uoa).toBe('Area_A');
	});

	it('marks ok=false when duplicate UOAs are present (cell errors added)', () => {
		const rows: string[][] = [
			['Area_A', '0.6', '3', '0.25'],
			['Area_A', '0.3', '1', '0.1']
		];
		const result = validateCsv(validHeader, rows, metricMap);
		expect(result.ok).toBe(false);
	});
});

describe('validateCsv — empty rows', () => {
	it('returns ok=true for empty rows (no errors to report)', () => {
		// Validator does not require rows to be non-empty by default
		const result = validateCsv(validHeader, [], metricMap);
		expect(result.ok).toBe(true);
		expect(result.numericObjects).toBeNull();
	});
});

describe('validateCsv — missing values', () => {
	it('tracks missingness for empty cells in missingnessMap', () => {
		const rows: string[][] = [['Area_A', '', '3', '0.25']];
		const result = validateCsv(validHeader, rows, metricMap);
		expect(result.ok).toBe(true);
		const entry = result.missingnessMap.find((e) => e.metric === 'MET001');
		expect(entry).toBeDefined();
		expect(entry!.missing).toBe(1);
	});
});

describe('validateCsv — type errors', () => {
	it('records a cellError for a value that violates the type constraint', () => {
		// MET003 has type num[0:1] — value 1.5 exceeds upper bound
		const rows: string[][] = [['Area_A', '0.5', '2', '1.5']];
		const result = validateCsv(validHeader, rows, metricMap);
		expect(result.ok).toBe(false);
		expect(result.cellErrors.some((e) => e.colName === 'MET003')).toBe(true);
	});

	it('returns ok=true when all cells satisfy type constraints', () => {
		const rows: string[][] = [['Area_A', '0.4', '1.5', '0.2']];
		const result = validateCsv(validHeader, rows, metricMap);
		expect(result.ok).toBe(true);
	});
});
