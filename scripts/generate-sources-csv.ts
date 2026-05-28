#!/usr/bin/env bun
/**
 * scripts/generate-sources-csv.ts
 *
 * Generates an example metric sources CSV compatible with the MetricSourcesUploader.
 *
 * Reads metric IDs from reference.json and UoA codes from input_good_50_pcode.csv,
 * then writes static/data/input_good_sources.csv with realistic example rows.
 *
 * Usage:
 *   bun ./scripts/generate-sources-csv.ts
 *   bun ./scripts/generate-sources-csv.ts --out /path/to/output.csv
 */

import fs from 'fs';
import path from 'path';

// ── Paths ─────────────────────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), 'static', 'data');
const REFERENCE_JSON = path.join(DATA_DIR, 'reference.json');
const INPUT_PCODE = path.join(DATA_DIR, 'input_good_50_pcode.csv');

const argOutIdx = process.argv.indexOf('--out');
const OUT = argOutIdx !== -1 && process.argv[argOutIdx + 1]
	? process.argv[argOutIdx + 1]
	: path.join(DATA_DIR, 'input_good_sources.csv');

// ── Helpers ───────────────────────────────────────────────────────────────────

function readJson(p: string): Record<string, any> {
	return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function csvHeader(cols: string[]): string {
	return cols.join(',');
}

function csvRow(values: string[]): string {
	return values.map((v) => (v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v)).join(',');
}

// ── Read reference metric IDs grouped by system ───────────────────────────────

const refJson = readJson(REFERENCE_JSON);

function collectMetrics(
	json: Record<string, any>,
	filterFn: (system: Record<string, any>) => boolean
): string[] {
	const ids: string[] = [];
	for (const system of json.systems ?? []) {
		if (!filterFn(system)) continue;
		for (const factor of system.factors ?? []) {
			for (const sub of factor.sub_factors ?? []) {
				for (const ind of sub.indicators ?? []) {
					for (const met of ind.metrics ?? []) {
						if (met.metric) ids.push(met.metric as string);
					}
				}
			}
		}
	}
	return ids;
}

const mortalityIds    = collectMetrics(refJson, (s) => s.id === 'mortality');
const healthIds       = collectMetrics(refJson, (s) => s.id === 'health_outcomes');
const foodIds         = collectMetrics(refJson, (s) => s.id === 'food_system');
const washIds         = collectMetrics(refJson, (s) => s.id === 'water_system');
const livelihoodsIds  = collectMetrics(refJson, (s) => s.id === 'living_conditions');

// ── Read UoA codes from pcode fixture ─────────────────────────────────────────

const pcodeLines = fs.readFileSync(INPUT_PCODE, 'utf-8').split('\n').filter(Boolean);
const allUoas = pcodeLines.slice(1).map((l) => l.split(',')[0].trim()).filter(Boolean);
// Grab two small subsets for UoA-scoped examples
const uoaSubsetA = allUoas.slice(0, 5).join(',');   // first 5
const uoaSubsetB = allUoas.slice(10, 18).join(',');  // next 8

// ── Build example rows ────────────────────────────────────────────────────────

type Row = {
	source: string;
	metric_ids: string;
	link: string;
	uoa: string;
	start_of_data_collection: string;
	end_of_data_collection: string;
};

const rows: Row[] = [];

// Row 1 — MSNA: global, covers mortality + food security metrics
if (mortalityIds.length > 0 || foodIds.length > 0) {
	rows.push({
		source: 'Multi-Sector Needs Assessment 2024',
		metric_ids: [...mortalityIds.slice(0, 3), ...foodIds.slice(0, 4)].join(','),
		link: '',
		uoa: '',
		start_of_data_collection: '2024-01-15',
		end_of_data_collection: '2024-03-30'
	});
}

// Row 2 — Admin registry: global, covers wash + livelihoods metrics
if (washIds.length > 0 || livelihoodsIds.length > 0) {
	rows.push({
		source: 'National Admin Registry',
		metric_ids: [...washIds.slice(0, 3), ...livelihoodsIds.slice(0, 3)].join(','),
		link: '',
		uoa: '',
		start_of_data_collection: '2023-07-01',
		end_of_data_collection: '2023-12-31'
	});
}

// Row 3 — Health facility survey: UoA-specific (subset A), covers health outcome metrics
if (healthIds.length > 0 && uoaSubsetA) {
	rows.push({
		source: 'Health Facility Survey – North Zone',
		metric_ids: healthIds.slice(0, 5).join(','),
		link: '',
		uoa: uoaSubsetA,
		start_of_data_collection: '2024-02-01',
		end_of_data_collection: '2024-04-15'
	});
}

// Row 4 — IPC assessment: UoA-specific (subset B), covers food security metrics
if (foodIds.length > 0 && uoaSubsetB) {
	rows.push({
		source: 'IPC Acute Food Insecurity Analysis',
		metric_ids: foodIds.slice(0, 4).join(','),
		link: '',
		uoa: uoaSubsetB,
		start_of_data_collection: '2024-03-01',
		end_of_data_collection: '2024-05-31'
	});
}

// Row 5 — Rapid assessment with link: global, remaining health metrics
if (healthIds.length > 5) {
	rows.push({
		source: 'Emergency Rapid Assessment Q1',
		metric_ids: healthIds.slice(5, 9).join(','),
		link: 'https://example.org/reports/era-q1-2024',
		uoa: '',
		start_of_data_collection: '2024-01-05',
		end_of_data_collection: '2024-01-20'
	});
}

if (rows.length === 0) {
	console.error('No metric IDs found — is reference.json present?');
	process.exit(1);
}

// ── Write CSV ─────────────────────────────────────────────────────────────────

const COLS = [
	'source',
	'metric_ids',
	'link',
	'uoa',
	'start_of_data_collection',
	'end_of_data_collection'
] as const;

const lines = [
	csvHeader([...COLS]),
	...rows.map((r) => csvRow(COLS.map((c) => r[c])))
];

fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf-8');
console.log(`Written ${rows.length} source rows → ${OUT}`);
for (const r of rows) {
	const scope = r.uoa ? `UoAs: ${r.uoa.split(',').length}` : 'global';
	const metCount = r.metric_ids.split(',').length;
	console.log(`  · "${r.source}" — ${metCount} metric(s), ${scope}`);
}
