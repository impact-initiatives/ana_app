import { browser } from '$app/environment';
import type { MetricSourceRow, MetricSourcesMap } from '$lib/types/sources';

const STORAGE_KEY = 'ana_metric_sources_v1';

interface MetricSourcesState {
	sourcesMap: MetricSourcesMap | null;
	sourcesRaw: MetricSourceRow[];
	filename: string | null;
	uploadedAt: string | null;
	entryCount: number;
}

const initialState: MetricSourcesState = {
	sourcesMap: null,
	sourcesRaw: [],
	filename: null,
	uploadedAt: null,
	entryCount: 0
};

export const metricSourcesStore = $state<MetricSourcesState>({ ...initialState });

export function setMetricSources(
	map: MetricSourcesMap,
	rows: MetricSourceRow[],
	filename: string
): void {
	const uploadedAt = new Date().toISOString();
	const entryCount = Object.keys(map).length;

	metricSourcesStore.sourcesMap = map;
	metricSourcesStore.sourcesRaw = rows;
	metricSourcesStore.filename = filename;
	metricSourcesStore.uploadedAt = uploadedAt;
	metricSourcesStore.entryCount = entryCount;

	if (browser) {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify({ map, rows, filename, uploadedAt, entryCount }));
		} catch (e) {
			console.warn('[metricSourcesStore] Failed to persist to localStorage:', e);
		}
	}
}

export function clearMetricSources(): void {
	metricSourcesStore.sourcesMap = null;
	metricSourcesStore.sourcesRaw = [];
	metricSourcesStore.filename = null;
	metricSourcesStore.uploadedAt = null;
	metricSourcesStore.entryCount = 0;

	if (browser) {
		localStorage.removeItem(STORAGE_KEY);
	}
}

export function hydrateMetricSourcesStore(): void {
	if (!browser) return;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return;
		const saved = JSON.parse(raw) as {
			map: MetricSourcesMap;
			rows: MetricSourceRow[];
			filename: string;
			uploadedAt: string;
			entryCount: number;
		};
		metricSourcesStore.sourcesMap = saved.map;
		metricSourcesStore.sourcesRaw = saved.rows ?? [];
		metricSourcesStore.filename = saved.filename;
		metricSourcesStore.uploadedAt = saved.uploadedAt;
		metricSourcesStore.entryCount = saved.entryCount;
	} catch {
		localStorage.removeItem(STORAGE_KEY);
	}
}
