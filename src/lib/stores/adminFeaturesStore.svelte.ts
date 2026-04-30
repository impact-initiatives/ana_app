// src/lib/stores/adminFeaturesStore.svelte.ts
import { browser } from '$app/environment';
import i18nCountries from 'i18n-iso-countries';
import enLocale from 'i18n-iso-countries/langs/en.json';
i18nCountries.registerLocale(enLocale);

const STORAGE_KEY = 'ana_admin_features_store';

export type FetchState = 'idle' | 'loading' | 'done' | 'error';

export interface AdminFeaturesState {
  adm1: any | null;
  adm2: any | null;
  /** ADM1 polygon features — only populated in MIXED mode for filling ADM1-level UoAs on the map. */
  adm1Polygons: any | null;
  /** Identifies which country + level was last fetched, to avoid redundant requests. */
  cachedKey: string | null;
  /** Human-readable country name resolved from the ISO-2 prefix of cachedKey via country-list-js. */
  countryName: string | null;
  fetchState: FetchState;
  fetchError: string | null;
  /** pcode → human-readable admin name (gis_name ?? name). Built from adm2 + adm1Polygons features. */
  pcodeLabelMap: Record<string, string> | null;
}

const initialState: AdminFeaturesState = {
  adm1: null,
  adm2: null,
  adm1Polygons: null,
  cachedKey: null,
  countryName: null,
  fetchState: 'idle',
  fetchError: null,
  pcodeLabelMap: null
};

/** Derive a human-readable country name from a pcode-based cache key (e.g. "SD01001_ADM1" → "Sudan"). */
export function countryNameFromKey(key: string): string | null {
  const iso2 = key.slice(0, 2).toUpperCase();
  return i18nCountries.getName(iso2, 'en') ?? null;
}

function loadFromStorage(): AdminFeaturesState {
  if (!browser) return initialState;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as AdminFeaturesState;
    // Restore meaningful states: done (has data), error (lookup failed), idle (otherwise).
    // 'loading' is never persisted — it's always transient.
    const fetchState: FetchState = parsed.adm1
      ? 'done'
      : parsed.fetchState === 'error'
        ? 'error'
        : 'idle';
    // Re-derive countryName on hydration so old persisted data without the field still works.
    const countryName = parsed.countryName ?? (parsed.cachedKey ? countryNameFromKey(parsed.cachedKey) : null);
    return { ...parsed, fetchState, fetchError: fetchState === 'error' ? parsed.fetchError : null, countryName };
  } catch {
    return initialState;
  }
}

function persist(value: AdminFeaturesState): void {
  if (!browser) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch (e) {
    console.warn('[adminFeaturesStore] Failed to persist to localStorage:', e);
  }
}

export const adminFeaturesStore = $state<AdminFeaturesState>(loadFromStorage());

function buildPcodeLabelMap(adm2: any, adm1: any, adm1Polygons?: any): Record<string, string> {
  const map: Record<string, string> = {};
  // ADM2 features — keyed by adm2_source_code
  for (const f of (adm2?.features ?? [])) {
    const code: string | undefined = f.properties?.adm2_source_code;
    const name: string | undefined = f.properties?.gis_name ?? f.properties?.name;
    if (code && name) map[code] = name;
  }
  // ADM1 features — use adm1Polygons when available (lines only carry adm1_pcode, not gis_name)
  const adm1Source = adm1Polygons ?? adm1;
  for (const f of (adm1Source?.features ?? [])) {
    const code: string | undefined = f.properties?.adm1_source_code ?? f.properties?.pcode;
    const name: string | undefined = f.properties?.gis_name ?? f.properties?.name;
    if (code && name) map[code] = name;
  }
  return map;
}

export function setAdminFeatures(adm1: any, adm2: any, key: string, adm1Polygons?: any) {
  adminFeaturesStore.adm1 = adm1;
  adminFeaturesStore.adm2 = adm2;
  adminFeaturesStore.adm1Polygons = adm1Polygons ?? null;
  adminFeaturesStore.cachedKey = key;
  adminFeaturesStore.countryName = countryNameFromKey(key);
  adminFeaturesStore.fetchState = 'done';
  adminFeaturesStore.fetchError = null;
  adminFeaturesStore.pcodeLabelMap = buildPcodeLabelMap(adm2, adm1, adm1Polygons);
  persist($state.snapshot(adminFeaturesStore) as AdminFeaturesState);
}

export function setAdminFetchState(state: FetchState, error?: string) {
  adminFeaturesStore.fetchState = state;
  adminFeaturesStore.fetchError = error ?? null;
  // Persist error state so reload doesn't retry a known-bad pcode.
  if (state === 'error') {
    persist($state.snapshot(adminFeaturesStore) as AdminFeaturesState);
  }
}

/**
 * Returns "Name (pcode)" when a name is known, otherwise just "pcode".
 * Reactive: safe to call inside $derived blocks.
 */
export function uoaLabel(pcode: unknown): string {
  const key = String(pcode);
  const name = adminFeaturesStore.pcodeLabelMap?.[key];
  return name ? `${name} (${key})` : key;
}

export function clearAdminFeatures() {
  adminFeaturesStore.adm1 = null;
  adminFeaturesStore.adm2 = null;
  adminFeaturesStore.adm1Polygons = null;
  adminFeaturesStore.cachedKey = null;
  adminFeaturesStore.countryName = null;
  adminFeaturesStore.fetchState = 'idle';
  adminFeaturesStore.fetchError = null;
  adminFeaturesStore.pcodeLabelMap = null;
  if (browser) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}
