#!/usr/bin/env bun
/**
 * generate-indicators-json.ts
 * Converts static/data/reference.csv → static/data/reference.json
 * Run validate-indicators.ts afterwards to check schema + id consistency.
 *
 * Usage:
 *   bun ./scripts/generate-indicators-json.ts [--csv <path>] [--out <path>] [--help]
 */

import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import type { Metric, Indicator, ReferenceRoot } from '$lib/types/structure';

const DATA_DIR = path.join(process.cwd(), 'static', 'data');
const CSV_DEFAULT = path.join(DATA_DIR, 'reference.csv');
const OUT_DEFAULT = path.join(DATA_DIR, 'reference.json');

// ── CLI ───────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): { csvPath: string; outPath: string; help: boolean } {
	let csvPath = CSV_DEFAULT,
		outPath = OUT_DEFAULT,
		help = false;
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--help' || argv[i] === '-h') help = true;
		else if (argv[i] === '--csv' && argv[i + 1]) csvPath = path.resolve(argv[++i]);
		else if (argv[i] === '--out' && argv[i + 1]) outPath = path.resolve(argv[++i]);
	}
	return { csvPath, outPath, help };
}

// ── CSV row shape ─────────────────────────────────────────────────────────────

interface RefRow {
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
	'Acute needs threshold (4)',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const toSnakeCase = (s: string) =>
	s
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');

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

// ── CSV parsing ───────────────────────────────────────────────────────────────

function parseCsv<T>(filePath: string): T[] {
	if (!fs.existsSync(filePath)) {
		console.error(`Error: file not found: ${filePath}`);
		process.exit(2);
	}
	const raw = fs.readFileSync(filePath, 'utf-8');
	const result = Papa.parse<T>(raw.startsWith('\uFEFF') ? raw.slice(1) : raw, {
		header: true,
		skipEmptyLines: true
	});
	if (result.errors.length > 0) {
		console.warn(`Warnings parsing CSV (${result.errors.length}):`);
		result.errors
			.slice(0, 5)
			.forEach((e) => console.warn(`  row ${e.row ?? '?'}: [${e.code}] ${e.message}`));
	}
	return result.data.map((row) => {
		const out: Record<string, string> = {};
		for (const [k, v] of Object.entries(row as Record<string, string>))
			out[k.trim()] = (v ?? '').trim();
		return out as T;
	});
}

// ── Build ─────────────────────────────────────────────────────────────────────

type CircleNode = {
	name: string;
	children?: CircleNode[];
	value?: number;
	id?: string;
	/** Full metric object for leaf nodes (matches `Metric` from structure.ts) */
	metric?: Metric
	/** Allow extra fields for consumers (e.g. thresholds, color, metadata). Use unknown to avoid permissive `any`. */
	[key: string]: unknown;
};

function build(rows: RefRow[]): {
	root: ReferenceRoot;
	emptyTypeIds: string[];
	circlePackingRoot: CircleNode;
} {
	const systemOrder: string[] = [];
	const factorOrder = new Map<string, string[]>(); // sysId   → fKeys
	const sfOrder = new Map<string, string[]>();     // fKey    → sfKeys
	const indOrder = new Map<string, string[]>(); // sfKey   → indKeys
	const metricMap = new Map<string, Metric[]>();   // indKey  → metrics

	const systemLabels = new Map<string, string>();
	const factorLabels = new Map<string, string>();
	const sfLabels = new Map<string, string>();
	const indLabels = new Map<string, string>(); // indKey  → raw label

	const seenSys = new Set<string>(),
		seenFac = new Set<string>(),
		seenSf = new Set<string>(),
		seenInd = new Set<string>();
	const emptyTypeIds: string[] = [];

	const fk = (sys: string, fac: string) => `${sys}::${fac}`;
	const sfk = (sys: string, fac: string, sf: string) => `${sys}::${fac}::${sf}`;
	const indk = (sys: string, fac: string, sf: string, ind: string) =>
		`${sys}::${fac}::${sf}::${ind}`;

	for (const row of rows) {
		const id = row['MET_ID']?.trim();
		// Do not skip empty/invalid IDs — include them so Pass 5 catches them consistently
		// with the browser upload path. Blank trailing CSV rows will also fail Pass 5.

		const sysId = toSnakeCase(row['System'] ?? '');
		const facId = toSnakeCase(row['Factor'] ?? '');
		const sfId = toSnakeCase(row['Sub-Factor'] ?? '');
		const indId = toSnakeCase(row['Indicator'] ?? '');
		const fKey = fk(sysId, facId);
		const sfKey = sfk(sysId, facId, sfId);
		const indKey = indk(sysId, facId, sfId, indId);

		if (!seenSys.has(sysId)) {
			seenSys.add(sysId);
			systemOrder.push(sysId);
			factorOrder.set(sysId, []);
			systemLabels.set(sysId, (row['System'] ?? '').trim());
		}
		if (!seenFac.has(fKey)) {
			seenFac.add(fKey);
			factorOrder.get(sysId)!.push(fKey);
			sfOrder.set(fKey, []);
			factorLabels.set(fKey, (row['Factor'] ?? '').trim());
		}
		if (!seenSf.has(sfKey)) {
			seenSf.add(sfKey);
			sfOrder.get(fKey)!.push(sfKey);
			indOrder.set(sfKey, []);
			sfLabels.set(sfKey, (row['Sub-Factor'] ?? '').trim());
		}
		if (!seenInd.has(indKey)) {
			seenInd.add(indKey);
			indOrder.get(sfKey)!.push(indKey);
			metricMap.set(indKey, []);
			indLabels.set(indKey, (row['Indicator'] ?? '').trim());
		}

		const rawType = (row['Type'] ?? '').trim();
		const type: string | null = rawType === '' ? null : rawType;
		if (type === null) emptyTypeIds.push(id);

		const pref = parseInteger(row['Preference'] ?? '');
		const et = nullIfEmpty(row['Evidence type'] ?? '');
		const anVal = roundThreshold(row['Acute needs threshold (4)'] ?? '');
		const vanVal = roundThreshold(row['Very acute needs threshold (5)'] ?? '');
		// van_is_strict: null for supporting evidence or reference-only metrics
		// (VAN not applicable); true/false based on whether van adds signal beyond an.
		const vanIsStrict: boolean | null =
			pref === 3 || et === 'Supporting evidence'
				? null
				: vanVal !== null && vanVal !== anVal;

		metricMap.get(indKey)!.push({
			metric: id,
			label: nullIfEmpty(row['Metric'] ?? ''),
			level: nullIfEmpty(row['Level'] ?? ''),
			preference: pref,
			evidence_type: et,
			type,
			msna_module: nullIfEmpty(row['MSNA module'] ?? ''),
			msna_indicator: nullIfEmpty(row['MSNA indicator'] ?? ''),
			question_kobo_code: nullIfEmpty(row['Question KOBO Code'] ?? ''),
			remarks_limitations: nullIfEmpty(row['Remarks/Limitations'] ?? ''),
			thresholds: {
				an: anVal,
				van: vanVal
			},
			van_is_strict: vanIsStrict,
			above_or_below: (row['Above or below'] ?? '').trim(),
			evidence_threshold: parseInteger(row['Evidence threshold'] ?? ''),
			factor_threshold: parseInteger(row['Factor threshold'] ?? ''),
			risk_concept: nullIfNA(row['Risk concept'] ?? '')
		});
	}

	const root: ReferenceRoot = {
		systems: systemOrder.map((sysId) => ({
			id: sysId,
			label: systemLabels.get(sysId) ?? sysId,
			factors: (factorOrder.get(sysId) ?? []).map((fKey) => {
				const [, facId] = fKey.split('::');
				return {
					id: facId,
					label: factorLabels.get(fKey) ?? facId,
					sub_factors: (sfOrder.get(fKey) ?? []).map((sfKey) => {
						const [, , sfId] = sfKey.split('::');
						return {
							id: sfId,
							label: sfLabels.get(sfKey) ?? sfId,
							indicators: (indOrder.get(sfKey) ?? []).map((indKey) => {
								const indId = indKey.split('::')[3];
								return {
									id: indId,
									label: indLabels.get(indKey) ?? indId,
									metrics: metricMap.get(indKey) ?? []
								} satisfies Indicator;
							})
						};
					})
				};
			})
		}))
	};

	// Build a D3 circle-packing friendly hierarchical object.
	// Hierarchy: system → factor → subfactor → indicator → metric (leaf).
	// Every node receives a stable `id` so client code can safely key lists by `id`.
	// Leaves (metrics) receive a numeric `value` so D3 can size them.
	const circlePackingRoot = {
		name: 'root',
		id: 'root',
		children: root.systems.map((sys) => ({
			name: sys.label ?? sys.id,
			id: sys.id,
			children: sys.factors.map((fac) => ({
				name: fac.label ?? fac.id,
				id: `${sys.id}::${fac.id}`,
				children: fac.sub_factors.map((sf) => ({
					name: sf.label ?? sf.id,
					id: `${sys.id}::${fac.id}::${sf.id}`,
					children: sf.indicators.map((ind) => ({
						name: ind.label ?? ind.id,
						id: `${sys.id}::${fac.id}::${sf.id}::${ind.id}`,
						children: ind.metrics.map((m) => ({
							name: m.label ?? m.metric,
							id: m.metric,
							// Map `preference` to a reversed size so higher preference (1) => larger node.
							// preference: 1 -> size 3, 2 -> size 2, 3 -> size 1
							value: Math.max(1, 4 - (m.preference ?? 3)),
							// Attach the full metric object so the circle-packing leaf contains
							// all fields (level, type, thresholds, etc.) for display/interaction.
							metric: m
						}))
					}))
				}))
			}))
		}))
	};

	return { root, emptyTypeIds, circlePackingRoot };
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
	const { csvPath, outPath, help } = parseArgs(process.argv.slice(2));
	if (help) {
		console.log('Usage: bun generate-reference-json.ts [--csv <path>] [--out <path>]');
		process.exit(0);
	}

	console.log(`Reading: ${csvPath}`);
	const rows = parseCsv<RefRow>(csvPath);
	console.log(`Parsed ${rows.length} rows`);

	if (rows.length > 0) {
		const headers = Object.keys(rows[0]);
		const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c as string));
		if (missing.length > 0) {
			console.error(`Error: required column(s) missing from CSV:\n  ${missing.join('\n  ')}`);
			console.error('Rename or add the column(s) and re-run.');
			process.exitCode = 1;
			return;
		}
	}

	const { root, emptyTypeIds, circlePackingRoot } = build(rows);

	if (emptyTypeIds.length > 0) {
		console.warn(
			`\n⚠ ${emptyTypeIds.length} metric(s) have empty Type → type: null (not validated):`
		);
		for (let i = 0; i < emptyTypeIds.length; i += 6)
			console.warn('  ' + emptyTypeIds.slice(i, i + 6).join(', '));
	}

	const allIds = root.systems.flatMap((s) =>
		s.factors.flatMap((f) =>
			f.sub_factors.flatMap((sf) =>
				sf.indicators.flatMap((ind) => ind.metrics.map((m) => m.metric))
			)
		)
	);
	const dupes = [...new Set(allIds.filter((id, i) => allIds.indexOf(id) !== i))];
	if (dupes.length > 0) console.warn(`\n⚠ Duplicate metric IDs: ${dupes.join(', ')}`);

	console.log('\nStructure:');
	let total = 0;
	for (const sys of root.systems) {
		const nMetrics = sys.factors.reduce(
			(n, f) =>
				n +
				f.sub_factors.reduce(
					(m, sf) => m + sf.indicators.reduce((k, ind) => k + ind.metrics.length, 0),
					0
				),
			0
		);
		total += nMetrics;
		console.log(
			`  ${sys.id.padEnd(32)} ${String(nMetrics).padStart(3)} metrics  (${sys.factors.length} factors, ${sys.factors.reduce((n, f) => n + f.sub_factors.length, 0)} sub-factors, ${sys.factors.reduce((n, f) => n + f.sub_factors.reduce((m, sf) => m + sf.indicators.length, 0), 0)} indicators)`
		);
	}
	console.log(`  ${'TOTAL'.padEnd(32)} ${String(total).padStart(3)}`);
	if (emptyTypeIds.length > 0) console.log(`  Null type: ${emptyTypeIds.length}`);

	fs.mkdirSync(path.dirname(outPath), { recursive: true });
	const generatedAt = new Date().toISOString();
	const json = JSON.stringify({ generatedAt, ...root }, null, 2);
	fs.writeFileSync(outPath, json, 'utf-8');
	console.log(`\nWrote: ${outPath} (${(json.length / 1024).toFixed(1)} KB)`);

	const cpOutPath = path.join(path.dirname(outPath), 'reference-circlepacking.json');
	const cpJson = JSON.stringify({ generatedAt, ...circlePackingRoot }, null, 2);
	fs.writeFileSync(cpOutPath, cpJson, 'utf-8');
	console.log(`Wrote: ${cpOutPath} (${(cpJson.length / 1024).toFixed(1)} KB)`);
}

main();
