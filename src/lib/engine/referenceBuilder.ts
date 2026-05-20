/**
 * referenceBuilder.ts
 *
 * Browser-safe CSV parsing and validation for custom reference uploads.
 * Intentionally stricter than scripts/generate-reference-json.ts — this
 * handles untrusted user input rather than a trusted build-time CSV.
 *
 * Validation errors block Apply; warnings are shown but non-blocking.
 *
 * Key differences vs. the generate script:
 *   - MET_ID format is an error (not silently skipped)
 *   - Preference must be 1|2|3 (not defaulted to 0)
 *   - Above or below must be "Above"|"Below" (not stored as-is)
 *   - System/Factor/Sub-Factor are cross-checked against the base reference
 *   - New Indicators within existing Sub-Factors are allowed (warning only)
 */

import Papa from 'papaparse';
import { METRIC_ID_REGEX, METRIC_TYPE_REGEX, MetricPreferenceEnum, MetricDirectionEnum } from '$lib/types/structure';
import type { ReferenceRoot } from '$lib/types/structure';

// ── Row shape (mirrors generate script's RefRow) ──────────────────────────────

export interface RefRow {
	MET_ID: string;
	Level: string;
	System: string;
	Factor: string;
	'Sub-Factor': string;
	Indicator: string;
	Preference: string;
	'Evidence type': string;
	Type: string;
	Metric: string;
	'MSNA module': string;
	'MSNA indicator': string;
	'Question KOBO Code': string;
	'Remarks/Limitations': string;
	'Acute needs threshold (4)': string;
	'Very acute needs threshold (5)': string;
	'Above or below': string;
	'Evidence threshold': string;
	'Factor threshold': string;
	'Risk concept': string;
	[key: string]: string;
}

const REQUIRED_COLUMNS: (keyof RefRow)[] = [
	'MET_ID',
	'System',
	'Factor',
	'Sub-Factor',
	'Indicator',
	'Preference',
	'Type',
	'Above or below',
	'Evidence threshold',
	'Factor threshold',
	'Acute needs threshold (4)'
];

// ── Helpers (duplicated from generate script — different lifecycle) ────────────

export const toSnakeCase = (s: string): string =>
	s
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');

const isNumericOrEmpty = (s: string): boolean => {
	const t = s.trim();
	return t === '' || t.toUpperCase() === 'NA' || !isNaN(parseFloat(t));
};

const isNonNegativeInteger = (s: string): boolean => {
	const t = s.trim();
	if (t === '') return true;
	const n = parseInt(t, 10);
	return !isNaN(n) && n >= 0 && String(n) === t;
};

const VALID_PREFERENCES = new Set([
	String(MetricPreferenceEnum.One),
	String(MetricPreferenceEnum.Two),
	String(MetricPreferenceEnum.Three)
]);

// ── Parse ─────────────────────────────────────────────────────────────────────

/**
 * Parse a reference CSV text (header mode, BOM-safe).
 * Returns rows with trimmed keys and values.
 */
export function parseReferenceCsvText(csvText: string): { rows: RefRow[]; parseErrors: string[] } {
	const text = csvText.startsWith('﻿') ? csvText.slice(1) : csvText;
	const result = Papa.parse<Record<string, string>>(text, {
		header: true,
		skipEmptyLines: true
	});

	const parseErrors = result.errors.map(
		(e) => `Row ${e.row ?? '?'}: [${e.code}] ${e.message}`
	);

	const rows = result.data.map((row) => {
		const out: Record<string, string> = {};
		for (const [k, v] of Object.entries(row)) out[k.trim()] = (v ?? '').trim();
		return out as RefRow;
	});

	return { rows, parseErrors };
}

// ── Validate ──────────────────────────────────────────────────────────────────

/**
 * Validate parsed reference rows against structural rules and the base reference.
 *
 * @param rows     Rows from parseReferenceCsvText
 * @param baseJson The currently loaded base reference.json (for sys/fac/sf cross-check)
 */
export function validateRefRows(
	rows: RefRow[],
	baseJson: Record<string, unknown>
): { errors: string[]; warnings: string[] } {
	const errors: string[] = [];
	const warnings: string[] = [];

	if (rows.length === 0) {
		errors.push('CSV contains no data rows.');
		return { errors, warnings };
	}

	// Check required columns present
	const headers = Object.keys(rows[0]);
	const missingCols = REQUIRED_COLUMNS.filter((c) => !headers.includes(c as string));
	if (missingCols.length > 0) {
		errors.push(`Required column(s) missing: ${missingCols.join(', ')}`);
		return { errors, warnings };
	}

	// Build lookup sets from base reference for cross-checking
	const base = baseJson as unknown as ReferenceRoot;
	const sysMap = new Map<string, ReferenceRoot['systems'][0]>();
	for (const sys of base.systems ?? []) sysMap.set(sys.id, sys);

	// Track seen MET_IDs for duplicate detection
	const seenIds = new Set<string>();

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const rowNum = i + 2; // 1-indexed + header row
		const id = row['MET_ID']?.trim() ?? '';

		if (!METRIC_ID_REGEX.test(id)) {
			errors.push(
				`Row ${rowNum}: MET_ID "${id}" is invalid — must be MET followed by 3+ digits (e.g. MET001)`
			);
			continue;
		}

		if (seenIds.has(id)) {
			errors.push(`Row ${rowNum}: Duplicate MET_ID "${id}"`);
		}
		seenIds.add(id);

		const prefStr = row['Preference']?.trim() ?? '';
		if (!VALID_PREFERENCES.has(prefStr)) {
			errors.push(`Row ${rowNum} (${id}): Preference "${prefStr}" must be 1, 2, or 3`);
		}

		const typeStr = row['Type']?.trim() ?? '';
		if (typeStr === '') {
			warnings.push(`Row ${rowNum} (${id}): Type is empty — metric will have no type constraint`);
		} else if (!METRIC_TYPE_REGEX.test(typeStr)) {
			errors.push(
				`Row ${rowNum} (${id}): Type "${typeStr}" is invalid — expected: num, int, num[0:1], int[0+], etc.`
			);
		}

		const aob = row['Above or below']?.trim() ?? '';
		if (aob !== MetricDirectionEnum.Above && aob !== MetricDirectionEnum.Below) {
			errors.push(
				`Row ${rowNum} (${id}): "Above or below" must be "Above" or "Below", got "${aob}"`
			);
		}

		if (!isNumericOrEmpty(row['Acute needs threshold (4)'] ?? '')) {
			errors.push(
				`Row ${rowNum} (${id}): "Acute needs threshold (4)" must be numeric or empty, got "${row['Acute needs threshold (4)'] ?? ''}"`
			);
		}

		if (!isNumericOrEmpty(row['Very acute needs threshold (5)'] ?? '')) {
			errors.push(
				`Row ${rowNum} (${id}): "Very acute needs threshold (5)" must be numeric or empty, got "${row['Very acute needs threshold (5)'] ?? ''}"`
			);
		}

		if (!isNonNegativeInteger(row['Evidence threshold'] ?? '')) {
			errors.push(
				`Row ${rowNum} (${id}): "Evidence threshold" must be a non-negative integer, got "${row['Evidence threshold'] ?? ''}"`
			);
		}

		if (!isNonNegativeInteger(row['Factor threshold'] ?? '')) {
			errors.push(
				`Row ${rowNum} (${id}): "Factor threshold" must be a non-negative integer, got "${row['Factor threshold'] ?? ''}"`
			);
		}

		// Cross-check System / Factor / Sub-Factor against base reference
		const sysId = toSnakeCase(row['System'] ?? '');
		const facId = toSnakeCase(row['Factor'] ?? '');
		const sfId = toSnakeCase(row['Sub-Factor'] ?? '');

		const matchedSys = sysMap.get(sysId);
		if (!matchedSys) {
			errors.push(
				`Row ${rowNum} (${id}): System "${row['System']}" not found in base reference`
			);
			continue;
		}

		const matchedFac = matchedSys.factors.find((f) => f.id === facId);
		if (!matchedFac) {
			errors.push(
				`Row ${rowNum} (${id}): Factor "${row['Factor']}" not found in system "${matchedSys.label ?? matchedSys.id}"`
			);
			continue;
		}

		const matchedSf = matchedFac.sub_factors.find((sf) => sf.id === sfId);
		if (!matchedSf) {
			errors.push(
				`Row ${rowNum} (${id}): Sub-Factor "${row['Sub-Factor']}" not found in factor "${matchedFac.label ?? matchedFac.id}"`
			);
			continue;
		}

		// New Indicator within existing Sub-Factor → informational warning only
		const indId = toSnakeCase(row['Indicator'] ?? '');
		const matchedInd = matchedSf.indicators.find((ind) => ind.id === indId);
		if (!matchedInd) {
			warnings.push(
				`Row ${rowNum} (${id}): Indicator "${row['Indicator']}" is new — will be created under "${matchedSf.label ?? matchedSf.id}"`
			);
		}
	}

	return { errors, warnings };
}
