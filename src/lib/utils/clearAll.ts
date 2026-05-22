import { clearFlagResult } from '$lib/stores/flagStore.svelte';
import { clearValidatorState } from '$lib/stores/validatorStore.svelte';
import { clearAdminFeatures } from '$lib/stores/adminFeaturesStore.svelte';
import { clearFilters } from '$lib/stores/resultsFilterStore.svelte';
import { clearCustomReferenceState } from '$lib/stores/metricStore.svelte';

export function clearAllStores(): void {
	clearFlagResult();
	clearValidatorState();
	clearAdminFeatures();
	clearFilters();
}

/** Called when reference.json generatedAt changes between deployments. Clears all data-
 *  derived state so the user starts fresh with the new framework version. */
export function clearAllStoresOnFrameworkUpdate(): void {
	clearFlagResult();
	clearValidatorState();
	clearAdminFeatures();
	clearFilters();
	clearCustomReferenceState();
}
