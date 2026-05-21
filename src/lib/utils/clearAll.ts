import { clearFlagResult } from '$lib/stores/flagStore.svelte';
import { clearValidatorState } from '$lib/stores/validatorStore.svelte';
import { clearAdminFeatures } from '$lib/stores/adminFeaturesStore.svelte';
import { clearFilters } from '$lib/stores/resultsFilterStore.svelte';

export function clearAllStores(): void {
	clearFlagResult();
	clearValidatorState();
	clearAdminFeatures();
	clearFilters();
}
