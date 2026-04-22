import { browser } from '$app/environment';
import { asset } from '$app/paths';
import type { Metric } from '$lib/types/structure';
import type { MetricMap } from '$lib/engine/validator';

/* --------------------- Fetch + flatten --------------------- */

async function loadReference(init?: RequestInit): Promise<unknown> {
	const url = asset('/data/reference.json');
	const res = await fetch(url, init);
	if (!res.ok) throw new Error(`Failed to fetch reference.json: ${res.status}`);
	return res.json();
}

function register(met: unknown, map: MetricMap): void {
	if (!met || typeof met !== 'object') return;
	const m = met as Record<string, unknown>;
	if (!m['metric']) return;
	const key = String(m['metric']).trim().toUpperCase();
	if (!key) return;
	map[key] = met as Metric;
}

function flattenMetrics(json: unknown): MetricMap {
	const map: MetricMap = Object.create(null);
	if (!json || typeof json !== 'object') return map;
	const j = json as Record<string, unknown>;
	if (!Array.isArray(j['systems'])) return map;

	for (const system of j['systems']) {
		if (!system || typeof system !== 'object') continue;
		const s = system as Record<string, unknown>;
		const factors = Array.isArray(s['factors']) ? s['factors'] : [];
		for (const factor of factors) {
			if (!factor || typeof factor !== 'object') continue;
			const f = factor as Record<string, unknown>;
			const subs = Array.isArray(f['sub_factors']) ? f['sub_factors'] : [];
			for (const sub of subs) {
				if (!sub || typeof sub !== 'object') continue;
				const sf = sub as Record<string, unknown>;
				if (!Array.isArray(sf['indicators'])) continue;
				for (const ind of sf['indicators']) {
					if (!ind || typeof ind !== 'object') continue;
					const indicator = ind as Record<string, unknown>;
					if (!Array.isArray(indicator['metrics'])) continue;
					for (const met of indicator['metrics']) register(met, map);
				}
			}
		}
	}

	return map;
}

const STORAGE_KEY = 'ana_metric_store_v2';

export interface MetricStoreState {
	referenceJson: Record<string, any> | null;
	metricMap: MetricMap;
	generatedAt: string | null;
}

const initialState: MetricStoreState = {
	referenceJson: null,
	metricMap: Object.create(null) as MetricMap,
	generatedAt: null
};

function loadFromStorage(): MetricStoreState {
	if (!browser) return initialState;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return initialState;
		return JSON.parse(raw) as MetricStoreState;
	} catch {
		return initialState;
	}
}

function persist(value: MetricStoreState): void {
	if (!browser) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
	} catch (e) {
		console.warn('[metricStore] Failed to persist to localStorage:', e);
	}
}

/**
 * Reactive metric store (Svelte 5 runes).
 * Starts empty — call hydrateMetricStore() in layout onMount (after first paint)
 * so the localStorage JSON.parse does not block the initial spinner.
 */
export const metricStore = $state<MetricStoreState>(initialState);

// Populated by layout onMount after the app-loader has painted its first frame.
export function hydrateMetricStore(): void {
	const saved = loadFromStorage();
	metricStore.referenceJson = saved.referenceJson;
	metricStore.metricMap = saved.metricMap;
	metricStore.generatedAt = saved.generatedAt;
}

export async function loadMetrics(): Promise<void> {
	try {
		const json = await loadReference();
		const incoming = (json as Record<string, any>).generatedAt as string | undefined;
		if (incoming && incoming === metricStore.generatedAt) return;
		const map = flattenMetrics(json);
		metricStore.referenceJson = json as Record<string, any>;
		metricStore.metricMap = map;
		metricStore.generatedAt = incoming ?? null;
		persist($state.snapshot(metricStore) as MetricStoreState);
	} catch (e) {
		console.error('[metricStore] Failed to load reference.json:', e);
	}
}
