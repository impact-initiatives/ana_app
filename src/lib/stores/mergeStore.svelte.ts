import { browser } from '$app/environment';
import type { ParsedMergeResult } from '$lib/engine/mergeDeepDives.js';

const STORAGE_KEY = 'ana_merge_store';

export interface MergeState {
	parsed: ParsedMergeResult | null;
	filename: string | null;
	mergedAt: string | null;
}

const initialState: MergeState = {
	parsed: null,
	filename: null,
	mergedAt: null
};

function loadFromStorage(): MergeState {
	if (!browser) return initialState;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return initialState;
		return JSON.parse(raw) as MergeState;
	} catch {
		return initialState;
	}
}

function persist(value: MergeState): void {
	if (!browser) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
	} catch (e) {
		console.warn('[mergeStore] Failed to persist to localStorage:', e);
	}
}

export const mergeStore = $state<MergeState>(loadFromStorage());

export function setMergeResult(parsed: ParsedMergeResult, filename: string | null): void {
	mergeStore.parsed = parsed;
	mergeStore.filename = filename;
	mergeStore.mergedAt = new Date().toISOString();
	persist($state.snapshot(mergeStore) as MergeState);
}

export function clearMergeResult(): void {
	mergeStore.parsed = initialState.parsed;
	mergeStore.filename = initialState.filename;
	mergeStore.mergedAt = initialState.mergedAt;
	if (browser) {
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {
			// ignore
		}
	}
}
