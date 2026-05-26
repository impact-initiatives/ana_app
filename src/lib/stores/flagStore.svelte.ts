import { browser } from '$app/environment';

const STORAGE_KEY = 'ana_flag_store';

export interface FlagState {
	flaggedResult: Record<string, any>[] | null;
	uploadedAt: string | null;
	filename: string | null;
	metadataCols: string[];
}

const initialState: FlagState = {
	flaggedResult: null,
	uploadedAt: null,
	filename: null,
	metadataCols: []
};

function loadFromStorage(): FlagState {
	if (!browser) return initialState;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return initialState;
		return JSON.parse(raw) as FlagState;
	} catch {
		return initialState;
	}
}

function persist(value: FlagState): void {
	if (!browser) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
	} catch (e) {
		console.warn('[flagStore] Failed to persist to localStorage:', e);
	}
}

/**
 * Reactive flag store (Svelte 5 runes).
 * Starts empty — call hydrateFlagStore() in layout onMount (after first paint)
 * so the localStorage JSON.parse does not block the initial spinner.
 */
export const flagStore = $state<FlagState>(initialState);

// Populated by layout onMount after the app-loader has painted its first frame.
export function hydrateFlagStore(): void {
	const saved = loadFromStorage();
	flagStore.flaggedResult = saved.flaggedResult;
	flagStore.uploadedAt = saved.uploadedAt;
	flagStore.filename = saved.filename;
	flagStore.metadataCols = saved.metadataCols;
}

export function setFlagResult(
	flaggedResult: Record<string, any>[],
	filename: string | null,
	metadataCols: string[] = []
): void {
	flagStore.flaggedResult = flaggedResult;
	flagStore.uploadedAt = new Date().toISOString();
	flagStore.filename = filename;
	flagStore.metadataCols = metadataCols;
	persist($state.snapshot(flagStore) as FlagState);
}

export function clearFlagResult(): void {
	flagStore.flaggedResult = initialState.flaggedResult;
	flagStore.uploadedAt = initialState.uploadedAt;
	flagStore.filename = initialState.filename;
	flagStore.metadataCols = initialState.metadataCols;
	if (browser) {
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {
			// ignore
		}
	}
}
