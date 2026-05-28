import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockClearFlagResult = vi.fn();
const mockClearValidatorState = vi.fn();
const mockClearAdminFeatures = vi.fn();
const mockClearFilters = vi.fn();
const mockClearCustomReferenceState = vi.fn();
const mockClearMetricSources = vi.fn();

vi.mock('$lib/stores/flagStore.svelte', () => ({ clearFlagResult: mockClearFlagResult }));
vi.mock('$lib/stores/validatorStore.svelte', () => ({ clearValidatorState: mockClearValidatorState }));
vi.mock('$lib/stores/adminFeaturesStore.svelte', () => ({
	clearAdminFeatures: mockClearAdminFeatures
}));
vi.mock('$lib/stores/resultsFilterStore.svelte', () => ({ clearFilters: mockClearFilters }));
vi.mock('$lib/stores/metricStore.svelte', () => ({
	clearCustomReferenceState: mockClearCustomReferenceState
}));
vi.mock('$lib/stores/metricSourcesStore.svelte', () => ({
	clearMetricSources: mockClearMetricSources
}));

const { clearAllStores, clearAllStoresOnFrameworkUpdate } = await import('$lib/utils/clearAll');

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => vi.clearAllMocks());

describe('clearAllStores', () => {
	it('clears flag, validator, admin, filter, and metric sources stores', () => {
		clearAllStores();
		expect(mockClearFlagResult).toHaveBeenCalledOnce();
		expect(mockClearValidatorState).toHaveBeenCalledOnce();
		expect(mockClearAdminFeatures).toHaveBeenCalledOnce();
		expect(mockClearFilters).toHaveBeenCalledOnce();
		expect(mockClearMetricSources).toHaveBeenCalledOnce();
	});

	it('does not clear custom reference state', () => {
		clearAllStores();
		expect(mockClearCustomReferenceState).not.toHaveBeenCalled();
	});
});

describe('clearAllStoresOnFrameworkUpdate', () => {
	it('clears flag, validator, admin, filter, and custom reference stores', () => {
		clearAllStoresOnFrameworkUpdate();
		expect(mockClearFlagResult).toHaveBeenCalledOnce();
		expect(mockClearValidatorState).toHaveBeenCalledOnce();
		expect(mockClearAdminFeatures).toHaveBeenCalledOnce();
		expect(mockClearFilters).toHaveBeenCalledOnce();
		expect(mockClearCustomReferenceState).toHaveBeenCalledOnce();
	});
});
