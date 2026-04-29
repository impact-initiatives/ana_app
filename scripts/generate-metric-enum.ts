#!/usr/bin/env bun
/**
 * Script: generate-metric-enum.ts
 *
 * Reads `static/data/reference.csv` and generates a TypeScript file exporting
 * a string enum `MetricIDEnum` into `src/lib/types/generated/metric-enum.ts`.
 *
 * Usage:
 *   bun ./scripts/generate-metric-enum.ts
 *
 * Behavior:
 * - Reads the `Metric ID` column (e.g. MET001, MET002, …).
 * - Emits an enum where each member name is a PascalCase identifier derived from the
 *   metric ID and the value is the original ID.
 * - Creates output directory if necessary and overwrites the file.
 *
 * Output example:
 *   export enum MetricIDEnum {
 *     Met001 = 'MET001',
 *     Met002 = 'MET002',
 *   }
 */

import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

const INPUT_CSV = path.join(process.cwd(), 'static', 'data', 'reference.csv');
const OUTPUT_TS = path.join(process.cwd(), 'src', 'lib', 'types', 'generated', 'metric-enum.ts');

interface RefRow {
	'Metric ID': string;
	[key: string]: string;
}

/** Convert e.g. 'MET001' → 'Met001' (PascalCase-safe enum member name) */
function toEnumKey(metricId: string): string {
	if (!metricId) return '_';
	// MET001 → Met001
	const lower = metricId.toLowerCase();
	return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function generateEnumContent(entries: Array<{ key: string; value: string }>): string {
	const relPath = path.relative(path.dirname(OUTPUT_TS), INPUT_CSV).replace(/\\/g, '/');
	const header = `/**
 * THIS FILE IS GENERATED — DO NOT EDIT BY HAND
 * Generated from: ${relPath}
 * Generated at: ${new Date().toISOString()}
 */\n\n`;

	const lines: string[] = ['export enum MetricIDEnum {'];
	for (const e of entries) {
		lines.push(`\t${e.key} = '${e.value}',`);
	}
	lines.push('}\n');
	lines.push('// Convenience array of ids');
	lines.push('export const MetricIDs = Object.values(MetricIDEnum) as MetricIDEnum[];\n');
	lines.push('export type MetricID = MetricIDEnum;\n');

	return header + lines.join('\n');
}

function main(): void {
	if (!fs.existsSync(INPUT_CSV)) {
		console.error(`Input CSV not found: ${INPUT_CSV}`);
		process.exitCode = 2;
		return;
	}

	const raw = fs.readFileSync(INPUT_CSV, 'utf-8');
	const content = raw.startsWith('\uFEFF') ? raw.slice(1) : raw;

	const result = Papa.parse<RefRow>(content, { header: true, skipEmptyLines: true });
	if (result.errors.length > 0) {
		console.warn(`Warnings parsing CSV (${result.errors.length}):`);
		result.errors
			.slice(0, 5)
			.forEach((e) => console.warn(`  row ${e.row ?? '?'}: [${e.code}] ${e.message}`));
	}

	const seen = new Set<string>();
	const entries: Array<{ key: string; value: string }> = [];

	for (const row of result.data) {
		const id = (row['Metric ID'] ?? '').trim();
		if (!id.startsWith('MET') || seen.has(id)) continue;
		seen.add(id);
		entries.push({ key: toEnumKey(id), value: id });
	}

	if (entries.length === 0) {
		console.error('No MET* IDs found in CSV. Check the "Metric ID" column header.');
		process.exitCode = 1;
		return;
	}

	fs.mkdirSync(path.dirname(OUTPUT_TS), { recursive: true });
	const fileContent = generateEnumContent(entries);
	fs.writeFileSync(OUTPUT_TS, fileContent, 'utf-8');

	console.log(`Generated ${entries.length} metric IDs → ${OUTPUT_TS}`);
	process.exitCode = 0;
}

main();
