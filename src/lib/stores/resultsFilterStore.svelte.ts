import { browser } from '$app/environment';

const STORAGE_KEY = 'ana_results_filters_v1';

type FilterState = {
	selectedUoas: string[] | null;
	selectedPrelimKeys: string[] | null;
	groupByCol: string | null;
	selectedGroupValues: string[] | null;
	indSelectedSystems: string[] | null;
	indSelectedFactors: string[] | null;
};

function loadFilters(): Partial<FilterState> {
	if (!browser) return {};
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? (JSON.parse(raw) as Partial<FilterState>) : {};
	} catch {
		return {};
	}
}

const saved = loadFilters();

export const filterStore: FilterState = $state({
	selectedUoas: saved.selectedUoas ?? null,
	selectedPrelimKeys: saved.selectedPrelimKeys ?? null,
	groupByCol: saved.groupByCol ?? null,
	selectedGroupValues: saved.selectedGroupValues ?? null,
	indSelectedSystems: saved.indSelectedSystems ?? null,
	indSelectedFactors: saved.indSelectedFactors ?? null,
});

export function persistFilters(): void {
	if (!browser) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify($state.snapshot(filterStore)));
	} catch {
		/* storage full */
	}
}

export function clearFilters(): void {
	filterStore.selectedUoas = null;
	filterStore.selectedPrelimKeys = null;
	filterStore.groupByCol = null;
	filterStore.selectedGroupValues = null;
	filterStore.indSelectedSystems = null;
	filterStore.indSelectedFactors = null;
	if (browser) localStorage.removeItem(STORAGE_KEY);
}
