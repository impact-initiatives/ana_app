import { describe, it, expect } from 'vitest';
import { parseReferenceCsvText, validateRefRows, type RefRow } from '$lib/engine/referenceBuilder';
import baseJson from './fixtures/reference-mini-valid.json';

// ── Helpers ───────────────────────────────────────────────────────────────────

const REQUIRED_HEADERS = [
	'MET_ID',
	'System',
	'Factor',
	'Sub-Factor',
	'Indicator',
	'Preference',
	'Type',
	'Above or below',
	'Evidence threshold',
	'Subfactor threshold',
	'Acute needs threshold (4)'
].join(',');

/** Build a minimal valid CSV row for MET001 (exists in mini fixture). */
function validRow(overrides: Record<string, string> = {}): RefRow {
	return {
		MET_ID: 'MET001',
		System: 'Mortality',
		Factor: 'Mortality',
		'Sub-Factor': 'Mortality',
		Indicator: 'Crude mortality rate',
		Preference: '1',
		'Evidence type': 'AN signal',
		Type: 'num[0+]',
		Metric: 'Deaths per 10,000 per day',
		'MSNA module': '',
		'MSNA indicator': '',
		'Question KOBO Code': '',
		'Remarks/Limitations': '',
		'Acute needs threshold (4)': '1',
		'Very acute needs threshold (5)': '2',
		'Above or below': 'Above',
		'Evidence threshold': '1',
		'Subfactor threshold': '1',
		'Risk concept': '',
		Level: '',
		...overrides
	};
}

function toCsv(rows: RefRow[]): string {
	if (rows.length === 0) return REQUIRED_HEADERS + '\n';
	const headers = Object.keys(rows[0]);
	return [
		headers.join(','),
		...rows.map((r) => headers.map((h) => `"${(r[h] ?? '').replace(/"/g, '""')}"`).join(','))
	].join('\n');
}

// ── parseReferenceCsvText ─────────────────────────────────────────────────────

describe('parseReferenceCsvText', () => {
	it('parses a simple CSV with headers', () => {
		const csv = `MET_ID,System\nMET001,Mortality\n`;
		const { rows, parseErrors } = parseReferenceCsvText(csv);
		expect(parseErrors).toHaveLength(0);
		expect(rows).toHaveLength(1);
		expect(rows[0].MET_ID).toBe('MET001');
	});

	it('strips UTF-8 BOM', () => {
		const csv = `﻿MET_ID,System\nMET001,Mortality\n`;
		const { rows } = parseReferenceCsvText(csv);
		expect(rows[0].MET_ID).toBe('MET001');
	});

	it('trims whitespace from header keys', () => {
		const csv = ` MET_ID , System \nMET001,Mortality\n`;
		const { rows } = parseReferenceCsvText(csv);
		expect(rows[0].MET_ID).toBe('MET001');
	});

	it('returns empty rows array for header-only CSV', () => {
		const csv = `MET_ID,System\n`;
		const { rows } = parseReferenceCsvText(csv);
		expect(rows).toHaveLength(0);
	});
});

// ── validateRefRows — columns ─────────────────────────────────────────────────

describe('validateRefRows — column checks', () => {
	it('errors when CSV has no data rows', () => {
		const { errors } = validateRefRows([], baseJson as Record<string, unknown>);
		expect(errors.some((e) => e.includes('no data rows'))).toBe(true);
	});

	it('errors when a required column is missing', () => {
		// Row without "Preference" column
		const rows = [{ MET_ID: 'MET001', System: 'Mortality' } as never];
		const { errors } = validateRefRows(rows, baseJson as Record<string, unknown>);
		expect(errors.some((e) => e.includes('Preference'))).toBe(true);
	});
});

// ── validateRefRows — MET_ID ──────────────────────────────────────────────────

describe('validateRefRows — MET_ID', () => {
	it('errors when MET_ID does not match pattern (no prefix)', () => {
		const rows = [validRow({ MET_ID: 'ID001' })];
		const { errors } = validateRefRows(rows, baseJson as Record<string, unknown>);
		expect(errors.some((e) => e.includes('MET_ID'))).toBe(true);
	});

	it('errors when MET_ID has fewer than 3 digits', () => {
		const rows = [validRow({ MET_ID: 'MET01' })];
		const { errors } = validateRefRows(rows, baseJson as Record<string, unknown>);
		expect(errors.some((e) => e.includes('MET_ID'))).toBe(true);
	});

	it('accepts MET_ID with 3 digits', () => {
		const rows = [validRow({ MET_ID: 'MET001' })];
		const { errors } = validateRefRows(rows, baseJson as Record<string, unknown>);
		expect(errors.filter((e) => e.includes('MET_ID'))).toHaveLength(0);
	});

	it('accepts MET_ID with 4+ digits', () => {
		const rows = [validRow({ MET_ID: 'MET1000' })];
		const { errors } = validateRefRows(rows, baseJson as Record<string, unknown>);
		expect(errors.filter((e) => e.includes('MET_ID'))).toHaveLength(0);
	});

	it('errors on duplicate MET_ID', () => {
		const rows = [validRow({ MET_ID: 'MET001' }), validRow({ MET_ID: 'MET001' })];
		const { errors } = validateRefRows(rows, baseJson as Record<string, unknown>);
		expect(errors.some((e) => e.includes('Duplicate'))).toBe(true);
	});
});

// ── validateRefRows — Preference ──────────────────────────────────────────────

describe('validateRefRows — Preference', () => {
	it.each(['0', '4', 'yes', ''])('errors when Preference is "%s"', (pref) => {
		const rows = [validRow({ MET_ID: 'MET001', Preference: pref })];
		const { errors } = validateRefRows(rows, baseJson as Record<string, unknown>);
		expect(errors.some((e) => e.includes('Preference'))).toBe(true);
	});

	it.each(['1', '2', '3'])('accepts Preference "%s"', (pref) => {
		const rows = [validRow({ MET_ID: 'MET001', Preference: pref })];
		const { errors } = validateRefRows(rows, baseJson as Record<string, unknown>);
		expect(errors.filter((e) => e.includes('Preference'))).toHaveLength(0);
	});
});

// ── validateRefRows — Type ────────────────────────────────────────────────────

describe('validateRefRows — Type', () => {
	it('warns (not errors) when Type is empty', () => {
		const rows = [validRow({ MET_ID: 'MET001', Type: '' })];
		const { errors, warnings } = validateRefRows(rows, baseJson as Record<string, unknown>);
		expect(errors.filter((e) => e.includes('Type'))).toHaveLength(0);
		expect(warnings.some((w) => w.includes('Type') || w.includes('type'))).toBe(true);
	});

	it.each(['words', 'float', 'numeric'])('errors when Type is "%s"', (type) => {
		const rows = [validRow({ MET_ID: 'MET001', Type: type })];
		const { errors } = validateRefRows(rows, baseJson as Record<string, unknown>);
		expect(errors.some((e) => e.includes('Type'))).toBe(true);
	});

	it.each(['num', 'int', 'num[0+]', 'int[0:5]', 'num[0:1]'])('accepts Type "%s"', (type) => {
		const rows = [validRow({ MET_ID: 'MET001', Type: type })];
		const { errors } = validateRefRows(rows, baseJson as Record<string, unknown>);
		expect(errors.filter((e) => e.includes('Type'))).toHaveLength(0);
	});
});

// ── validateRefRows — Above or below ─────────────────────────────────────────

describe('validateRefRows — Above or below', () => {
	it.each(['above', 'below', 'ABOVE', 'neither', ''])(
		'errors when "Above or below" is "%s"',
		(val) => {
			const rows = [validRow({ MET_ID: 'MET001', 'Above or below': val })];
			const { errors } = validateRefRows(rows, baseJson as Record<string, unknown>);
			expect(errors.some((e) => e.includes('Above or below'))).toBe(true);
		}
	);

	it.each(['Above', 'Below'])('accepts "%s"', (val) => {
		const rows = [validRow({ MET_ID: 'MET001', 'Above or below': val })];
		const { errors } = validateRefRows(rows, baseJson as Record<string, unknown>);
		expect(errors.filter((e) => e.includes('Above or below'))).toHaveLength(0);
	});

	it('skips check for Supporting evidence rows with empty Above or below', () => {
		const rows = [validRow({ MET_ID: 'MET099', 'Evidence type': 'Supporting evidence', 'Above or below': '' })];
		const { errors } = validateRefRows(rows, baseJson as Record<string, unknown>);
		expect(errors.filter((e) => e.includes('Above or below'))).toHaveLength(0);
	});

	it('skips check for preference-3 rows with empty Above or below', () => {
		const rows = [validRow({ MET_ID: 'MET099', Preference: '3', 'Above or below': '' })];
		const { errors } = validateRefRows(rows, baseJson as Record<string, unknown>);
		expect(errors.filter((e) => e.includes('Above or below'))).toHaveLength(0);
	});
});

// ── validateRefRows — thresholds ──────────────────────────────────────────────

describe('validateRefRows — thresholds', () => {
	it('errors when AN threshold is non-numeric', () => {
		const rows = [validRow({ MET_ID: 'MET001', 'Acute needs threshold (4)': 'high' })];
		const { errors } = validateRefRows(rows, baseJson as Record<string, unknown>);
		expect(errors.some((e) => e.includes('threshold'))).toBe(true);
	});

	it('accepts empty AN threshold', () => {
		const rows = [validRow({ MET_ID: 'MET001', 'Acute needs threshold (4)': '' })];
		const { errors } = validateRefRows(rows, baseJson as Record<string, unknown>);
		expect(errors.filter((e) => e.includes('threshold'))).toHaveLength(0);
	});

	it('accepts "NA" as AN threshold', () => {
		const rows = [validRow({ MET_ID: 'MET001', 'Acute needs threshold (4)': 'NA' })];
		const { errors } = validateRefRows(rows, baseJson as Record<string, unknown>);
		expect(errors.filter((e) => e.includes('threshold'))).toHaveLength(0);
	});

	it('errors when Evidence threshold is negative', () => {
		const rows = [validRow({ MET_ID: 'MET001', 'Evidence threshold': '-1' })];
		const { errors } = validateRefRows(rows, baseJson as Record<string, unknown>);
		expect(errors.some((e) => e.includes('Evidence threshold'))).toBe(true);
	});

	it('errors when Subfactor threshold is non-integer', () => {
		const rows = [validRow({ MET_ID: 'MET001', 'Subfactor threshold': '1.5' })];
		const { errors } = validateRefRows(rows, baseJson as Record<string, unknown>);
		expect(errors.some((e) => e.includes('Subfactor threshold'))).toBe(true);
	});
});

// ── validateRefRows — cross-check against base reference ─────────────────────

describe('validateRefRows — base reference cross-check', () => {
	it('errors when System is not in base reference', () => {
		const rows = [validRow({ MET_ID: 'MET001', System: 'Unknown System' })];
		const { errors } = validateRefRows(rows, baseJson as Record<string, unknown>);
		expect(errors.some((e) => e.includes('System') && e.includes('not found'))).toBe(true);
	});

	it('errors when Factor is not in the system', () => {
		const rows = [validRow({ MET_ID: 'MET001', Factor: 'No Such Factor' })];
		const { errors } = validateRefRows(rows, baseJson as Record<string, unknown>);
		expect(errors.some((e) => e.includes('Factor') && e.includes('not found'))).toBe(true);
	});

	it('errors when Sub-Factor is not in the factor', () => {
		const rows = [validRow({ MET_ID: 'MET001', 'Sub-Factor': 'No Such Sub-Factor' })];
		const { errors } = validateRefRows(rows, baseJson as Record<string, unknown>);
		expect(errors.some((e) => e.includes('Sub-Factor') && e.includes('not found'))).toBe(true);
	});

	it('passes for valid System / Factor / Sub-Factor', () => {
		const rows = [validRow({ MET_ID: 'MET001' })];
		const { errors } = validateRefRows(rows, baseJson as Record<string, unknown>);
		expect(errors).toHaveLength(0);
	});

	it('warns (not errors) when Indicator is new within existing Sub-Factor', () => {
		const rows = [validRow({ MET_ID: 'MET001', Indicator: 'Brand New Indicator' })];
		const { errors, warnings } = validateRefRows(rows, baseJson as Record<string, unknown>);
		expect(errors).toHaveLength(0);
		expect(warnings.some((w) => w.includes('new'))).toBe(true);
	});
});

// ── validateRefRows — full valid row ──────────────────────────────────────────

describe('validateRefRows — full valid row', () => {
	it('returns no errors for a complete valid row (new MET_ID)', () => {
		const csv = toCsv([validRow({ MET_ID: 'MET099' })]);
		const { rows } = parseReferenceCsvText(csv);
		const { errors, warnings } = validateRefRows(rows, baseJson as Record<string, unknown>);
		expect(errors).toHaveLength(0);
		expect(warnings).toHaveLength(0);
	});

	it('warns (not errors) when the MET_ID already exists in the base reference', () => {
		const csv = toCsv([validRow({ MET_ID: 'MET001' })]);
		const { rows } = parseReferenceCsvText(csv);
		const { errors, warnings } = validateRefRows(rows, baseJson as Record<string, unknown>);
		expect(errors).toHaveLength(0);
		expect(warnings.some((w) => w.toLowerCase().includes('update'))).toBe(true);
	});

	it('returns no errors for multiple valid rows with distinct MET_IDs', () => {
		const csv = toCsv([validRow({ MET_ID: 'MET001' }), validRow({ MET_ID: 'MET002' })]);
		const { rows } = parseReferenceCsvText(csv);
		const { errors } = validateRefRows(rows, baseJson as Record<string, unknown>);
		expect(errors).toHaveLength(0);
	});
});
