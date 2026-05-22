/**
 * src/lib/engine/validator.ts
 *
 * CSV validation utilities for the ANA app.
 *
 * Exports:
 *   validateCsv(header, rows, metricMap, opts) → ValidationResult
 *
 * Type-string syntax (from structure.ts):
 *   type  = base ( '[' range ']' )?
 *   base  = 'num' | 'int'
 *   range = bound ':' bound   (closed interval [lb, ub])
 *         | bound '+'          (half-open: value >= lb)
 *
 *   type: null → no type constraint; any finite number is accepted.
 *   Unrecognised format string → warning only, value accepted if finite.
 *
 * Validation rules:
 *   - Header must include a 'uoa' column (case-insensitive).
 *   - Metric columns must match keys in metricMap (trimmed uppercase).
 *   - Each row must have a non-empty, unique UOA.
 *   - Indicator cells are checked against the indicator's type constraint.
 *   - Label fields (an_label, van_label) are never used for validation.
 */

import { parseMetricType } from '$lib/types/structure';
import type { Metric } from '$lib/types/structure';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CellError {
	row: number;
	colIndex: number;
	colName: string;
	value: string;
	message: string;
}

export interface DuplicateUoa {
	uoa: string;
	rows: number[];
}

export interface MissingnessEntry {
	metric: string;
	total: number;
	missing: number;
}

export interface ValidationResult {
	ok: boolean;
	headerErrors: string[];
	cellErrors: CellError[];
	warnings: string[];
	duplicateUoas: DuplicateUoa[];
	missingnessMap: MissingnessEntry[];
	metadataCols: string[];
	numericRows: (number | string | null)[][] | null;
	numericObjects: Record<string, number | string | null>[] | null;
	meta: { checkedRows: number; checkedCols: number };
}

export interface ValidateCsvOpts {
	requireNonEmpty?: boolean;
}

// metricMap values: the full Metric object keyed by normalised code (e.g. "MET001")
export type MetricMap = Record<string, Metric>;

// ── Column role discriminated union ──────────────────────────────────────────

type ColDef =
	| { kind: 'uoa' }
	| { kind: 'unknown'; raw: string }
	| { kind: 'metric'; key: string; def: Metric }
	| { kind: 'metadata'; raw: string };

// ── Internal helpers ──────────────────────────────────────────────────────────

function normalizeHeaderCell(h: unknown): string {
	if (h === null || h === undefined) return '';
	return String(h)
		.replace(/^\uFEFF/, '')
		.trim();
}

function normalizeIndicatorKey(k: unknown): string {
	if (k === null || k === undefined) return '';
	return String(k).trim().toUpperCase();
}

function toFinite(v: unknown): number {
	const n = Number(String(v ?? '').trim());
	return Number.isFinite(n) ? n : NaN;
}

// ── Cell-level validation ─────────────────────────────────────────────────────

interface CheckResult {
	ok: boolean;
	message?: string;
	warning?: string;
}

/**
 * Build a human-readable description of a parsed type constraint.
 * Examples:
 *   num        → "a number"
 *   int        → "an integer"
 *   num[0+]    → "a positive number (≥ 0)"
 *   num[0:1]   → "a number between 0 and 1 (likely a proportion)"
 *   int[0:1]   → "an integer between 0 and 1 (likely a binary)"
 *   int[0+]    → "a positive integer (≥ 0)"
 *   num[1:10]  → "a number between 1 and 10"
 *   int[1:10]  → "an integer between 1 and 10"
 */
function humanReadableType(parsed: {
	base: 'num' | 'int';
	lb: number | null;
	ub: number | null;
	isOpen: boolean;
}): string {
	const noun = parsed.base === 'int' ? 'an integer' : 'a number';

	if (parsed.lb == null && parsed.ub == null) {
		// No range at all
		return noun;
	}

	if (parsed.isOpen && parsed.lb != null) {
		// Half-open: lb+
		const adjective = parsed.base === 'int' ? 'a positive integer' : 'a positive number';
		return `${adjective} (≥ ${parsed.lb})`;
	}

	if (parsed.lb != null && parsed.ub != null) {
		// Closed interval
		const hint =
			parsed.lb === 0 && parsed.ub === 1
				? parsed.base === 'int'
					? ' (likely a binary)'
					: ' (likely a proportion)'
				: '';
		return `${noun} between ${parsed.lb} and ${parsed.ub}${hint}`;
	}

	// Fallback (shouldn't normally be reached)
	return noun;
}

/**
 * Check a single cell value against the metric's type constraint.
 * Uses parseMetricType from structure.ts — no local duplicate.
 */
function checkValueAgainstType(
	value: string,
	type: string | null | undefined,
	opts: ValidateCsvOpts = {}
): CheckResult {
	const trimmed = value == null ? '' : String(value).trim();

	// Empty cell
	if (trimmed === '') {
		return opts.requireNonEmpty
			? { ok: false, message: 'empty value' }
			: { ok: true, warning: 'missing' };
	}

	// Helper: check whether the raw string looks numeric at all
	const isNumericString = Number.isFinite(Number(trimmed));

	// type: null / empty → no type constraint, accept any finite number
	if (type == null || String(type).trim() === '') {
		if (isNumericString) return { ok: true };
		return { ok: false, message: `'${trimmed}' is a string, not a number` };
	}

	// Try to parse the type string (imported from structure.ts)
	const parsed = parseMetricType(type);

	if (!parsed) {
		// Unrecognised format — accept if finite, warn
		if (isNumericString)
			return { ok: true, warning: `unrecognised type '${type}' — accepted as finite number` };
		return { ok: false, message: `'${trimmed}' is a string, not a number` };
	}

	// Non-numeric string: report that before any range/integer check
	if (!isNumericString) {
		const expected = humanReadableType(parsed);
		return { ok: false, message: `'${trimmed}' is a string, not ${expected}` };
	}

	const n = toFinite(trimmed);
	// (isNumericString guard above makes NaN impossible here, but keep for safety)
	if (Number.isNaN(n)) return { ok: false, message: `'${trimmed}' is not a finite number` };

	if (parsed.base === 'int' && !Number.isInteger(n)) {
		return { ok: false, message: `value ${n} is not an integer` };
	}

	if (parsed.lb != null && n < parsed.lb) {
		const expected = humanReadableType(parsed);
		return { ok: false, message: `value ${n} is not ${expected}` };
	}

	if (!parsed.isOpen && parsed.ub != null && n > parsed.ub) {
		const expected = humanReadableType(parsed);
		return { ok: false, message: `value ${n} is not ${expected}` };
	}

	return { ok: true };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Validate a parsed CSV against the indicator map.
 *
 * @param header     - header row (array of strings)
 * @param rows       - data rows (array of array-of-strings)
 * @param metricMap  - flattened metric map keyed by normalised code (uppercase, e.g. "MET001").
 *                     Each value is a Metric from structure.ts.
 *                     The `type` field drives cell-level validation.
 * @param opts       - options (requireNonEmpty)
 */
export function validateCsv(
	header: unknown[],
	rows: unknown[][],
	metricMap: MetricMap,
	opts: ValidateCsvOpts = {}
): ValidationResult {
	const requireNonEmpty = !!opts.requireNonEmpty;

	const headerErrors: string[] = [];
	const cellErrors: CellError[] = [];
	const warnings: string[] = [];
	const duplicateUoas: DuplicateUoa[] = [];
	const missingnessMap: Record<string, { total: number; missing: number }> = Object.create(null);

	const empty: ValidationResult = {
		ok: false,
		headerErrors,
		cellErrors,
		warnings,
		duplicateUoas,
		missingnessMap: [],
		metadataCols: [],
		numericRows: null,
		numericObjects: null,
		meta: { checkedRows: 0, checkedCols: 0 }
	};

	// Sanity: header must be an array
	if (!Array.isArray(header)) {
		headerErrors.push('Header is missing or not an array');
		return empty;
	}

	const normalizedHeader = header.map(normalizeHeaderCell);

	// Locate uoa column
	const uoaIndex = normalizedHeader.findIndex((h) => h.toLowerCase() === 'uoa');
	if (uoaIndex === -1) headerErrors.push("Header must include a 'uoa' column");
	if (normalizedHeader.length === 0) headerErrors.push('Header row is empty');

	// Map every column to its role
	const colDefs: ColDef[] = normalizedHeader.map((h, idx): ColDef => {
		if (idx === uoaIndex) return { kind: 'uoa' };
		if (!h) return { kind: 'unknown', raw: h };
		const key = normalizeIndicatorKey(h);
		if (metricMap[key]) return { kind: 'metric', key, def: metricMap[key] };
		return { kind: 'metadata', raw: h };
	});

	const metadataCols: string[] = colDefs
		.map((cd, i) => (cd.kind === 'metadata' ? normalizedHeader[i] : null))
		.filter((n): n is string => n !== null);

	// Don't validate rows without a uoa column
	if (uoaIndex === -1) {
		return {
			...empty,
			headerErrors,
			metadataCols,
			meta: { checkedRows: 0, checkedCols: normalizedHeader.length }
		};
	}

	// ── Row validation ────────────────────────────────────────────────────────

	const uoaToRows: Record<string, number[]> = Object.create(null);

	for (let r = 0; r < rows.length; r++) {
		const row = Array.isArray(rows[r]) ? rows[r] : [];
		const padded = row.slice(0, normalizedHeader.length) as string[];
		while (padded.length < normalizedHeader.length) padded.push('');

		const rowNum = r + 2; // 1-based, header is row 1

		// UOA check
		const uoaValue = String(padded[uoaIndex] ?? '').trim();
		if (!uoaValue) {
			cellErrors.push({
				row: rowNum,
				colIndex: uoaIndex,
				colName: normalizedHeader[uoaIndex],
				value: uoaValue,
				message: 'uoa is empty'
			});
		} else {
			(uoaToRows[uoaValue] ??= []).push(rowNum);
		}

		// Metric column checks
		for (let c = 0; c < normalizedHeader.length; c++) {
			if (c === uoaIndex) continue;
			const cd = colDefs[c];

			if (cd.kind !== 'metric') {
				if (cd.kind === 'unknown') {
					const raw = String(padded[c] ?? '').trim();
					if (raw) warnings.push(`Row ${rowNum}, column ${c + 1} (unnamed): has value '${raw}'`);
				}
				// metadata columns: silently skip cell-level validation (values pass through via numericObjects)
				continue;
			}

			const value = String(padded[c] ?? '').trim();
			const colName = normalizedHeader[c];

			// Resolve type from the metric definition (null → no constraint)
			const rawType = cd.def.type;
			const type: string | null =
				rawType != null && String(rawType).trim() !== '' ? String(rawType).trim() : null;

			missingnessMap[colName] ??= { total: 0, missing: 0 };
			missingnessMap[colName].total += 1;

			const check = checkValueAgainstType(value, type, { requireNonEmpty });

			if (!check.ok) {
				cellErrors.push({
					row: rowNum,
					colIndex: c,
					colName,
					value,
					message: check.message ?? 'invalid value'
				});
			} else if (check.warning) {
				if (check.warning === 'missing') {
					missingnessMap[colName].missing += 1;
				} else {
					warnings.push(`Row ${rowNum}, col '${colName}': ${check.warning}`);
				}
			}
		}
	}

	// ── Duplicate UOA detection ───────────────────────────────────────────────

	for (const uoa of Object.keys(uoaToRows)) {
		const list = uoaToRows[uoa];
		if (list.length > 1) {
			duplicateUoas.push({ uoa, rows: list.slice() });
			for (const rn of list) {
				cellErrors.push({
					row: rn,
					colIndex: uoaIndex,
					colName: normalizedHeader[uoaIndex],
					value: uoa,
					message: `duplicate uoa '${uoa}'`
				});
			}
		}
	}

	// ── Numeric conversion ────────────────────────────────────────────────────

	let numericRows: (number | string | null)[][] | null = null;
	let numericObjects: Record<string, number | string | null>[] | null = null;

	if (rows.length > 0) {
		const converted: (number | string | null)[][] = [];
		let conversionOk = true;

		for (const rawRow of rows) {
			const row = Array.isArray(rawRow) ? rawRow : [];
			const padded = row.slice(0, normalizedHeader.length) as string[];
			while (padded.length < normalizedHeader.length) padded.push('');

			const outRow: (number | string | null)[] = new Array(normalizedHeader.length);
			for (let c = 0; c < normalizedHeader.length; c++) {
				const cd = colDefs[c];
				const raw = String(padded[c] ?? '').trim();
				if (cd.kind === 'metric') {
					if (raw === '') {
						outRow[c] = null;
					} else {
						const n = Number(raw);
						if (Number.isNaN(n)) {
							conversionOk = false;
							outRow[c] = raw;
						} else outRow[c] = n;
					}
				} else {
					outRow[c] = raw;
				}
			}
			converted.push(outRow);
		}

		if (conversionOk) {
			numericRows = converted;
			numericObjects = converted.map((row) => {
				const obj: Record<string, number | string | null> = {};
				for (let c = 0; c < normalizedHeader.length; c++) obj[normalizedHeader[c]] = row[c];
				return obj;
			});
		}
	}

	// ── Result ────────────────────────────────────────────────────────────────

	return {
		ok: headerErrors.length === 0 && cellErrors.length === 0,
		headerErrors,
		cellErrors,
		warnings,
		duplicateUoas,
		missingnessMap: Object.entries(missingnessMap).map(([metric, s]) => ({
			metric,
			total: s.total,
			missing: s.missing
		})),
		metadataCols,
		numericRows,
		numericObjects,
		meta: { checkedRows: rows.length, checkedCols: normalizedHeader.length }
	};
}
