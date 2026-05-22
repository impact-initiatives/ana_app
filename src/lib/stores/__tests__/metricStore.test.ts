import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── SvelteKit virtual module mocks (must be hoisted) ─────────────────────────

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$app/paths', () => ({ asset: (p: string) => p }));

// ── Minimal localStorage stub ─────────────────────────────────────────────────

const store: Record<string, string> = {};
const localStorage = {
	getItem: (k: string) => store[k] ?? null,
	setItem: (k: string, v: string) => { store[k] = v; },
	removeItem: (k: string) => { delete store[k]; },
	clear: () => { for (const k of Object.keys(store)) delete store[k]; }
};
vi.stubGlobal('localStorage', localStorage);

// ── Import under test ─────────────────────────────────────────────────────────

const {
	metricStore,
	loadMetrics,
	clearCustomReferenceState,
	STORAGE_KEY,
	CUSTOM_ROWS_KEY
} = await import('$lib/stores/metricStore.svelte');

function mockFetch(generatedAt: string) {
	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ generatedAt, systems: [] })
		})
	);
}

function setStoredGeneratedAt(generatedAt: string | null) {
	if (generatedAt === null) {
		localStorage.removeItem(STORAGE_KEY);
	} else {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ generatedAt, referenceJson: null, metricMap: {}, customReferenceActive: false, customMergeStats: null, customAppliedAt: null }));
	}
	// Sync metricStore to match stored state
	metricStore.generatedAt = generatedAt;
}

// ── loadMetrics — frameworkUpdated detection ──────────────────────────────────

describe('loadMetrics — frameworkUpdated', () => {
	beforeEach(() => {
		localStorage.clear();
		metricStore.generatedAt = null;
		metricStore.customReferenceActive = false;
		metricStore.referenceJson = null;
	});

	it('returns frameworkUpdated: false on first load (no stored generatedAt)', async () => {
		mockFetch('2026-05-22T10:00:00.000Z');
		const { frameworkUpdated } = await loadMetrics();
		expect(frameworkUpdated).toBe(false);
	});

	it('returns frameworkUpdated: false when generatedAt is unchanged', async () => {
		const ts = '2026-05-22T10:00:00.000Z';
		setStoredGeneratedAt(ts);
		mockFetch(ts);
		const { frameworkUpdated } = await loadMetrics();
		expect(frameworkUpdated).toBe(false);
	});

	it('returns frameworkUpdated: true when generatedAt changes', async () => {
		setStoredGeneratedAt('2026-01-01T00:00:00.000Z');
		mockFetch('2026-05-22T10:00:00.000Z');
		const { frameworkUpdated } = await loadMetrics();
		expect(frameworkUpdated).toBe(true);
	});

	it('updates metricStore.generatedAt to the new value', async () => {
		setStoredGeneratedAt('2026-01-01T00:00:00.000Z');
		mockFetch('2026-06-01T00:00:00.000Z');
		await loadMetrics();
		expect(metricStore.generatedAt).toBe('2026-06-01T00:00:00.000Z');
	});

	it('returns frameworkUpdated: false on fetch error', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
		const { frameworkUpdated } = await loadMetrics();
		expect(frameworkUpdated).toBe(false);
	});
});

// ── loadMetrics — custom rows skipped on framework change ─────────────────────

describe('loadMetrics — custom rows behavior', () => {
	beforeEach(() => {
		localStorage.clear();
		metricStore.generatedAt = null;
		metricStore.customReferenceActive = false;
	});

	it('skips custom rows re-merge when framework has changed', async () => {
		setStoredGeneratedAt('2026-01-01T00:00:00.000Z');
		localStorage.setItem(CUSTOM_ROWS_KEY, JSON.stringify({ rows: [], stats: {}, appliedAt: 'x' }));
		mockFetch('2026-05-22T10:00:00.000Z');

		const { frameworkUpdated } = await loadMetrics();

		expect(frameworkUpdated).toBe(true);
		// custom reference should NOT have been applied
		expect(metricStore.customReferenceActive).toBe(false);
	});

	it('does not set frameworkUpdated when generatedAt is unchanged even with custom rows', async () => {
		const ts = '2026-05-22T10:00:00.000Z';
		setStoredGeneratedAt(ts);
		// Put custom rows in localStorage — loadMetrics will try to re-merge
		localStorage.setItem(CUSTOM_ROWS_KEY, JSON.stringify({ rows: [], stats: {}, appliedAt: ts }));
		mockFetch(ts);

		const { frameworkUpdated } = await loadMetrics();

		expect(frameworkUpdated).toBe(false);
	});
});

// ── clearCustomReferenceState ─────────────────────────────────────────────────

describe('clearCustomReferenceState', () => {
	beforeEach(() => {
		localStorage.clear();
		metricStore.customReferenceActive = true;
		metricStore.customMergeStats = { added: 1, updated: 0, skipped: 0 } as any;
		metricStore.customAppliedAt = '2026-05-01T00:00:00.000Z';
		metricStore.generatedAt = '2026-05-22T10:00:00.000Z'; // should NOT be reset
	});

	it('clears custom reference state fields', () => {
		clearCustomReferenceState();
		expect(metricStore.customReferenceActive).toBe(false);
		expect(metricStore.customMergeStats).toBeNull();
		expect(metricStore.customAppliedAt).toBeNull();
	});

	it('removes custom rows from localStorage', () => {
		localStorage.setItem(CUSTOM_ROWS_KEY, JSON.stringify({ rows: [] }));
		clearCustomReferenceState();
		expect(localStorage.getItem(CUSTOM_ROWS_KEY)).toBeNull();
	});

	it('does not reset generatedAt or referenceJson', () => {
		const ts = '2026-05-22T10:00:00.000Z';
		metricStore.generatedAt = ts;
		clearCustomReferenceState();
		expect(metricStore.generatedAt).toBe(ts);
	});
});
