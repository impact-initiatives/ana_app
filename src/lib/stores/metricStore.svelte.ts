import { browser } from '$app/environment';
import { asset } from '$app/paths';
import type { Metric } from '$lib/types/structure';
import type { MetricMap } from '$lib/engine/dataValidator';
import type { RefRow } from '$lib/engine/referenceBuilder';
import type { MergeStats } from '$lib/engine/referenceMerger';

/* --------------------- Fetch + flatten --------------------- */

async function loadReference(init?: RequestInit): Promise<unknown> {
	const url = asset('/data/reference.json');
	// no-cache: always revalidate with the server (ETag/304) so a redeployed
	// reference.json is detected even when the browser has a cached copy.
	const res = await fetch(url, { cache: 'no-cache', ...init });
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

export const STORAGE_KEY = 'ana_metric_store_v2';
export const CUSTOM_ROWS_KEY = 'ana_custom_reference_v1';

export interface MetricStoreState {
	referenceJson: Record<string, any> | null;
	metricMap: MetricMap;
	generatedAt: string | null;
	customReferenceActive: boolean;
	customMergeStats: MergeStats | null;
	customAppliedAt: string | null;
}

const initialState: MetricStoreState = {
	referenceJson: null,
	metricMap: Object.create(null) as MetricMap,
	generatedAt: null,
	customReferenceActive: false,
	customMergeStats: null,
	customAppliedAt: null
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

export async function loadMetrics(): Promise<{ frameworkUpdated: boolean }> {
	try {
		const json = await loadReference();
		const incoming = (json as Record<string, any>).generatedAt as string | undefined;

		// Detect framework change: generatedAt differs from the stored value (null counts as different).
		const storedAt = metricStore.generatedAt;
		const frameworkUpdated = !!(incoming && incoming !== storedAt);

		// Skip custom rows re-merge when the framework has changed — old custom MET_IDs may
		// no longer exist in the new schema. The caller will wipe the custom rows.
		const customRaw = (!frameworkUpdated && browser) ? localStorage.getItem(CUSTOM_ROWS_KEY) : null;
		if (customRaw) {
			try {
				const { rows, stats, appliedAt } = JSON.parse(customRaw) as {
					rows: RefRow[];
					stats: MergeStats;
					appliedAt: string;
				};
				// Lazy import to avoid loading merger before it's needed
				const { mergeCustomRows } = await import('$lib/engine/referenceMerger');
				const { mergedJson, mergedMetricMap } = mergeCustomRows(json as Record<string, unknown>, rows);
				metricStore.referenceJson = mergedJson as Record<string, any>;
				metricStore.metricMap = mergedMetricMap;
				metricStore.generatedAt = incoming ?? null;
				metricStore.customReferenceActive = true;
				metricStore.customMergeStats = stats;
				metricStore.customAppliedAt = appliedAt;
				persist($state.snapshot(metricStore) as MetricStoreState);
				return { frameworkUpdated };
			} catch (e) {
				console.warn('[metricStore] Failed to re-apply custom reference, falling back to base:', e);
			}
		}

		if (incoming && incoming === storedAt && !metricStore.customReferenceActive) return { frameworkUpdated: false };
		const map = flattenMetrics(json);
		metricStore.referenceJson = json as Record<string, any>;
		metricStore.metricMap = map;
		metricStore.generatedAt = incoming ?? null;
		metricStore.customReferenceActive = false;
		metricStore.customMergeStats = null;
		metricStore.customAppliedAt = null;
		persist($state.snapshot(metricStore) as MetricStoreState);
		return { frameworkUpdated };
	} catch (e) {
		console.error('[metricStore] Failed to load reference.json:', e);
		return { frameworkUpdated: false };
	}
}

/**
 * Clear only the custom-reference side-effects without resetting the base reference or
 * reloading. Used when the framework version changes on boot.
 */
export function clearCustomReferenceState(): void {
	if (browser) localStorage.removeItem(CUSTOM_ROWS_KEY);
	metricStore.customReferenceActive = false;
	metricStore.customMergeStats = null;
	metricStore.customAppliedAt = null;
}

/**
 * Apply a merged custom reference to the store and persist the raw rows to localStorage.
 * Called after successful parse → validate → merge in ReferenceCustomiser.
 */
export function applyCustomReference(
	mergedJson: Record<string, any>,
	mergedMetricMap: MetricMap,
	stats: MergeStats,
	rows: RefRow[]
): void {
	const appliedAt = new Date().toISOString();
	metricStore.referenceJson = mergedJson;
	metricStore.metricMap = mergedMetricMap;
	metricStore.customReferenceActive = true;
	metricStore.customMergeStats = stats;
	metricStore.customAppliedAt = appliedAt;
	persist($state.snapshot(metricStore) as MetricStoreState);
	if (browser) {
		try {
			localStorage.setItem(CUSTOM_ROWS_KEY, JSON.stringify({ rows, stats, appliedAt }));
		} catch (e) {
			console.warn('[metricStore] Failed to persist custom reference rows:', e);
		}
	}
}

/**
 * Remove the custom reference from localStorage and reload the base reference.
 */
export async function clearCustomReference(): Promise<void> {
	if (browser) localStorage.removeItem(CUSTOM_ROWS_KEY);
	metricStore.customReferenceActive = false;
	metricStore.customMergeStats = null;
	metricStore.customAppliedAt = null;
	metricStore.generatedAt = null; // force loadMetrics past the early-return guard
	await loadMetrics();
}
