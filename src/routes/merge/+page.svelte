<script lang="ts">
	import {
		adminFeaturesStore,
		setAdminFeatures,
		setAdminFetchState
	} from '$lib/stores/adminFeaturesStore.svelte';
	import {
		parseMergeZip,
		conclusionToFlag,
		priorityFlagToConclusion
	} from '$lib/engine/mergeDeepDives';
	import { mergeStore, setMergeResult, clearMergeResult } from '$lib/stores/mergeStore.svelte';
	import { analyzeUoas } from '$lib/utils/pcode';
	import { fetchAdminsForCountry } from '$lib/engine/fetchAdmin';
	import Uploader, { type ProcessResult } from '$lib/components/data/Uploader.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import DataTable from '$lib/components/ui/DataTable.svelte';
	import ChoroplethMap from '$lib/components/viz/ChoroplethMap.svelte';
	import RadioToggle from '$lib/components/ui/RadioToggle.svelte';
	import DownloadButton from '$lib/components/ui/DownloadButton.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import SynthesisDetailModal from '$lib/components/merge/SynthesisDetailModal.svelte';

	let showTable = $state(false);
	let mapDownloadFn = $state<(() => Promise<void>) | undefined>(undefined);
	let uploaderKey = $state(0);
	let selectedUoa = $state<string | null>(null);

	const detailRows = $derived(
		selectedUoa ? (mergeStore.parsed?.synthesis ?? []).filter((r) => r.uoa === selectedUoa) : []
	);
	const detailAdminName = $derived(
		selectedUoa ? (adminFeaturesStore.pcodeLabelMap?.[selectedUoa] ?? '') : ''
	);

	const mapTitle = $derived(
		`ANA Outcome Conclusions${adminFeaturesStore.countryName ? ' for ' + adminFeaturesStore.countryName : ''}`
	);

	async function processMergeZip(file: File): Promise<ProcessResult> {
		clearMergeResult();
		const result = await parseMergeZip(file);

		if (result.errors.length) {
			return {
				ok: false,
				summary: 'Invalid conclusion values — fix before merging',
				details: [
					{
						label: `${result.errors.length} error${result.errors.length !== 1 ? 's' : ''}`,
						type: 'error',
						items: result.errors
					}
				]
			};
		}

		setMergeResult(result, file.name);
		const summary = `${result.uoaCount} UoAs · ${result.systemCount} systems · ${result.synthesis.length} synthesis rows`;
		const details: ProcessResult['details'] = result.warnings.length
			? [
					{
						label: `${result.warnings.length} warning${result.warnings.length !== 1 ? 's' : ''}`,
						type: 'warning',
						items: result.warnings
					}
				]
			: undefined;
		return { ok: true, summary, details };
	}

	function onMergeCleared() {
		clearMergeResult();
	}

	function clearAll() {
		clearMergeResult();
		uploaderKey++;
	}

	// One row per UoA: conclusion key first, then PF conclusion fallback for unfilled ZIPs.
	const mapRows = $derived.by(() => {
		if (!mergeStore.parsed) return [];
		const byUoa = new Map<string, { uoa: string; priority_flag: string }>();
		for (const r of mergeStore.parsed.synthesis) {
			const cf = conclusionToFlag(r.conclusion) ?? priorityFlagToConclusion(r.priorityFlag);
			if (!byUoa.has(r.uoa)) {
				byUoa.set(r.uoa, { uoa: r.uoa, priority_flag: cf ?? '' });
			} else if (cf) {
				byUoa.get(r.uoa)!.priority_flag = cf;
			}
		}
		return [...byUoa.values()];
	});

	// UoAs where no conclusion is filled AND priority flag is not 'no_data'
	// (no_data = nothing to deep dive, so no pattern needed)
	const noDeepDiveUoas = $derived(
		mergeStore.parsed
			? [
					...new Set(mergeStore.parsed.synthesis.filter((r) => !r.deepDiveRun).map((r) => r.uoa))
				].filter((uoa) => {
					const rows = mergeStore.parsed!.synthesis.filter((r) => r.uoa === uoa);
					return (
						rows.every((r) => !r.deepDiveRun) &&
						rows.some((r) => {
							const k = priorityFlagToConclusion(r.priorityFlag);
							return k !== null && k !== 'no_data';
						})
					);
				})
			: []
	);

	const hasGeo = $derived(adminFeaturesStore.adm1 !== null);
	const mapLevel = $derived<'ADM1' | 'ADM2' | 'MIXED'>(adminFeaturesStore.adm2 ? 'MIXED' : 'ADM1');

	function toKey(s: string): string {
		return s
			.toLowerCase()
			.replace(/\s+/g, '-')
			.replace(/[^a-z0-9-]/g, '');
	}

	// One row per UoA, per-system fields as pivot columns
	const uoaTableRows = $derived.by(() => {
		if (!mergeStore.parsed) return [] as Record<string, unknown>[];
		const seen = new Map<string, Record<string, unknown>>();
		for (const r of mergeStore.parsed.synthesis) {
			if (!seen.has(r.uoa)) {
				seen.set(r.uoa, {
					uoa: r.uoa,
					'admin-name': adminFeaturesStore.pcodeLabelMap?.[r.uoa] ?? '',
					'priority-flag': r.priorityFlag,
					conclusion: r.conclusion,
					'deep-dive-run': r.deepDiveRun
				});
			}
			const prefix = toKey(r.tab) + '_' + toKey(r.system);
			const row = seen.get(r.uoa)!;
			row[prefix + '_primary-hypothesis'] = r.primaryHypothesis;
			row[prefix + '_secondary-hypothesis'] = r.secondaryHypothesis;
			row[prefix + '_plausibility'] = r.plausibility;
			row[prefix + '_summary'] = r.summary;
			row[prefix + '_triangulation'] = r.triangulation;
		}
		return [...seen.values()];
	});

	// ── Admin boundary auto-detect ─────────────────────────────────────────────

	const mergeUoas = $derived(
		mergeStore.parsed ? [...new Set(mergeStore.parsed.synthesis.map((r) => r.uoa))] : []
	);
	const mergeUoaAnalysis = $derived(mergeUoas.length > 0 ? analyzeUoas(mergeUoas) : null);
	const mergeHasPcodes = $derived(
		mergeUoaAnalysis?.action === 'adm1' ||
			mergeUoaAnalysis?.action === 'adm2' ||
			mergeUoaAnalysis?.action === 'mixed'
	);
	const mergePcodeLevel = $derived<'ADM1' | 'ADM2' | 'MIXED'>(
		mergeUoaAnalysis?.action === 'adm2'
			? 'ADM2'
			: mergeUoaAnalysis?.action === 'mixed'
				? 'MIXED'
				: 'ADM1'
	);
	const mergePcodeKey = $derived.by(() => {
		if (!mergeUoaAnalysis || !mergeHasPcodes) return null;
		const first = (mergeUoaAnalysis.parsed ?? []).find(
			(p: { parsed?: { isPcode?: boolean; code?: string } }) => p.parsed?.isPcode
		);
		const code = first?.parsed?.code ?? mergeUoaAnalysis.pcode ?? null;
		return code ? `${code}_${mergePcodeLevel}` : null;
	});

	// Same ISO2 prefix + same admin level = GeoJSON already covers this country
	function isCompatibleAdminCache(cachedKey: string | null, newKey: string): boolean {
		if (!cachedKey) return false;
		return (
			cachedKey.slice(0, 2).toUpperCase() === newKey.slice(0, 2).toUpperCase() &&
			cachedKey.split('_').at(-1) === newKey.split('_').at(-1)
		);
	}

	$effect(() => {
		if (!mergePcodeKey || !mergeHasPcodes) return;
		if (
			adminFeaturesStore.fetchState === 'loading' ||
			adminFeaturesStore.fetchState === 'error' ||
			isCompatibleAdminCache(adminFeaturesStore.cachedKey, mergePcodeKey)
		)
			return;
		const first = (mergeUoaAnalysis!.parsed ?? []).find(
			(p: { parsed?: { isPcode?: boolean; code?: string } }) => p.parsed?.isPcode
		);
		const pcode = first?.parsed?.code ?? mergeUoaAnalysis!.pcode ?? '';
		setAdminFetchState('loading');
		fetchAdminsForCountry(pcode as string, mergePcodeLevel)
			.then((res) => {
				setAdminFeatures(res?.adm1 ?? null, res?.adm2 ?? null, mergePcodeKey!);
			})
			.catch((e) => {
				setAdminFetchState('error', String(e));
			});
	});
</script>

<div class="mx-auto max-w-5xl px-4 py-8">
	<PageHeader
		title="Merge deep-dives"
		subtitle="Upload the filled-in deep-dive ZIP to consolidate analytical conclusions into a single XLSX."
	/>

	<Card title="Upload ZIP">
		{#snippet titleActions()}
			{#if mergeStore.parsed}
				<div class="flex items-center gap-2">
					<span
						class="border-success/30 bg-success/10 text-success inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
					>
						<span class="bg-success inline-block size-1.5 rounded-full"></span>
						{mergeStore.filename ?? 'Results loaded'}
					</span>
					<button
						class="border-error/30 bg-error/10 text-error hover:bg-error/20 inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-150"
						onclick={clearAll}
					>
						<span class="bg-error inline-block size-1.5 rounded-full"></span>
						Clear
					</button>
				</div>
			{/if}
		{/snippet}
		<div class="mt-4">
			{#key uploaderKey}
				<Uploader
					size="md"
					accept=".zip"
					dropText="Drop your filled-in deep-dives ZIP here"
					detailsMode="collapse"
					process={processMergeZip}
					oncleared={onMergeCleared}
				/>
			{/key}
		</div>
	</Card>

	<!-- Results -->
	{#if mergeStore.parsed}
		<div class="mt-6 space-y-4">
			<RadioToggle
				bind:value={showTable}
				labelFalse="Outcome map"
				labelTrue="Synthesis table"
				name="merge-view"
			/>

			{#if !showTable}
				<Card title="Outcome map">
					{#snippet titleActions()}
						{#if mapDownloadFn}
							<DownloadButton onclick={mapDownloadFn} label="Download SVG" variant="outline" />
						{/if}
					{/snippet}
					{#if !hasGeo}
						<div role="alert" class="alert alert-info alert-soft text-sm">
							No admin boundary data loaded. Open the Results page and upload a CSV to load
							boundaries — they will be available here automatically.
						</div>
					{:else if mapRows.length === 0}
						<p class="text-base-content/60 text-sm">No UoAs found in the uploaded ZIP.</p>
					{:else}
						<ChoroplethMap
							adm1={adminFeaturesStore.adm1}
							adm2={adminFeaturesStore.adm2}
							rows={mapRows}
							level={mapLevel}
							country={adminFeaturesStore.countryName}
							layer={{ type: 'conclusion' }}
							layerTitle={mapTitle}
							patternedUoas={noDeepDiveUoas}
							ondownloadready={(fn) => (mapDownloadFn = fn)}
							onuoaclick={(uoa) => {
								if ((mergeStore.parsed?.synthesis ?? []).some((r) => r.uoa === uoa)) {
									selectedUoa = uoa;
								}
							}}
						/>
					{/if}
				</Card>
			{:else if uoaTableRows.length === 0}
				<div role="alert" class="alert alert-warning">
					<span class="text-sm">No well-filled conclusions found in the uploaded ZIP.</span>
				</div>
			{:else}
				<DataTable
					rows={uoaTableRows}
					tableClass="table-xs"
					headerRowClass="text-base-content text-xs"
					searchable
					downloadable
					downloadFilename="synthesis"
					overflow="paginate"
					pageSize={20}
					onrowclick={(cells) => {
						selectedUoa = cells['uoa'];
					}}
				/>
			{/if}
		</div>

		<SynthesisDetailModal
			uoa={selectedUoa ?? ''}
			adminName={detailAdminName}
			rows={detailRows}
			open={selectedUoa !== null}
			onclose={() => {
				selectedUoa = null;
			}}
		/>
	{/if}
</div>
