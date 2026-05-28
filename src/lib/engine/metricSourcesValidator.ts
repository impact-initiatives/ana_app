import Papa from 'papaparse';
import type { MetricMap } from '$lib/engine/dataValidator';
import type { MetricSourceRow, MetricSourceEntry, MetricSourcesMap } from '$lib/types/sources';

export type { MetricSourceRow, MetricSourceEntry, MetricSourcesMap };

const REQUIRED_COLUMNS = ['source', 'metric_ids'] as const;
const METRIC_ID_RE = /^MET\d{3,}$/;

export function parseMetricSourcesCsv(csvText: string): {
	rows: MetricSourceRow[];
	parseErrors: string[];
} {
	// Strip UTF-8 BOM if present
	const text = csvText.startsWith('﻿') ? csvText.slice(1) : csvText;

	const result = Papa.parse<Record<string, string>>(text, {
		header: true,
		skipEmptyLines: true,
		transformHeader: (h) => h.trim()
	});

	const parseErrors: string[] = result.errors.map((e) => e.message);

	if (result.data.length === 0 && parseErrors.length === 0) {
		return { rows: [], parseErrors: [] };
	}

	const headers = result.meta.fields ?? [];
	for (const col of REQUIRED_COLUMNS) {
		if (!headers.includes(col)) {
			parseErrors.push(`Missing required column: "${col}"`);
		}
	}

	if (parseErrors.length > 0) {
		return { rows: [], parseErrors };
	}

	const rows: MetricSourceRow[] = result.data.map((r) => ({
		source: (r['source'] ?? '').trim(),
		link: (r['link'] ?? '').trim(),
		metric_ids: (r['metric_ids'] ?? '').trim(),
		uoa: (r['uoa'] ?? '').trim(),
		start_of_data_collection: (r['start_of_data_collection'] ?? '').trim(),
		end_of_data_collection: (r['end_of_data_collection'] ?? '').trim()
	}));

	return { rows, parseErrors: [] };
}

export function validateMetricSourceRows(
	rows: MetricSourceRow[],
	metricMap: MetricMap,
	flaggedUoas: string[]
): { errors: string[]; warnings: string[] } {
	const errors: string[] = [];
	const warnings: string[] = [];

	const uoaSet = new Set(flaggedUoas);
	// Track expanded (metricId, uoaKey) pairs for duplicate detection
	// uoaKey = '*' for global, uoa code otherwise
	const seen = new Set<string>();

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const rowLabel = `Row ${i + 1}`;

		if (!row.source) {
			errors.push(`${rowLabel}: "source" is required but empty`);
		}

		if (!row.metric_ids) {
			errors.push(`${rowLabel}: "metric_ids" is required but empty`);
			continue;
		}

		const metricIds = row.metric_ids.split(',').map((s) => s.trim()).filter(Boolean);
		const uoaCodes = row.uoa
			? row.uoa.split(',').map((s) => s.trim()).filter(Boolean)
			: ['*'];

		for (const mid of metricIds) {
			if (!METRIC_ID_RE.test(mid)) {
				errors.push(`${rowLabel}: metric ID "${mid}" does not match expected format (MET + 3+ digits)`);
				continue;
			}
			if (!metricMap[mid]) {
				errors.push(`${rowLabel}: metric ID "${mid}" not found in the reference`);
				continue;
			}

			for (const uoa of uoaCodes) {
				if (uoa !== '*' && !uoaSet.has(uoa)) {
					errors.push(`${rowLabel}: UoA code "${uoa}" not found in the current dataset`);
				}
				const key = `${mid}__${uoa}`;
				if (seen.has(key)) {
					const scope = uoa === '*' ? 'global' : `UoA "${uoa}"`;
					errors.push(`Duplicate entry: metric "${mid}" appears more than once for ${scope}`);
				} else {
					seen.add(key);
				}
			}
		}

		if (row.start_of_data_collection && isNaN(Date.parse(row.start_of_data_collection))) {
			warnings.push(
				`${rowLabel}: "start_of_data_collection" value "${row.start_of_data_collection}" is not a parseable date`
			);
		}
		if (row.end_of_data_collection && isNaN(Date.parse(row.end_of_data_collection))) {
			warnings.push(
				`${rowLabel}: "end_of_data_collection" value "${row.end_of_data_collection}" is not a parseable date`
			);
		}
	}

	return { errors, warnings };
}

export function buildMetricSourcesMap(rows: MetricSourceRow[]): MetricSourcesMap {
	const map: MetricSourcesMap = {};

	for (const row of rows) {
		const entry: MetricSourceEntry = {
			source: row.source,
			link: row.link,
			startOfDataCollection: row.start_of_data_collection,
			endOfDataCollection: row.end_of_data_collection
		};

		const metricIds = row.metric_ids.split(',').map((s) => s.trim()).filter(Boolean);
		const uoaCodes = row.uoa
			? row.uoa.split(',').map((s) => s.trim()).filter(Boolean)
			: ['*'];

		for (const mid of metricIds) {
			for (const uoa of uoaCodes) {
				const key = uoa === '*' ? mid : `${mid}__${uoa}`;
				map[key] = entry;
			}
		}
	}

	return map;
}
