<script lang="ts">
	import { adminFeaturesStore } from '$lib/stores/adminFeaturesStore.svelte';
	import {
		parseMergeZip,
		downloadMergeXlsx,
		conclusionToFlag,
		priorityFlagToConclusion,
		type ParsedMergeResult
	} from '$lib/engine/mergeDeepDives';
	import Uploader, { type ProcessResult } from '$lib/components/data/Uploader.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import DataTable from '$lib/components/ui/DataTable.svelte';
	import ChoroplethMap from '$lib/components/viz/ChoroplethMap.svelte';
	import RadioToggle from '$lib/components/ui/RadioToggle.svelte';
	import DownloadButton from '$lib/components/ui/DownloadButton.svelte';
	import Card from '$lib/components/ui/Card.svelte';

	let parsed = $state<ParsedMergeResult | null>(null);
	let exportFileName = $state('');
	let showTable = $state(false);
	let mapDownloadFn = $state<(() => Promise<void>) | undefined>(undefined);

	const mapTitle = $derived(
		`ANA Outcome Conclusions${adminFeaturesStore.countryName ? ' for ' + adminFeaturesStore.countryName : ''}`
	);

	async function processMergeZip(file: File): Promise<ProcessResult> {
		parsed = null;
		exportFileName = file.name;
		const result = await parseMergeZip(file);
		parsed = result;

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
		parsed = null;
		exportFileName = '';
	}

	function exportXlsx() {
		if (!parsed) return;
		const baseName = exportFileName.replace(/\.zip$/i, '') || 'deepdives';
		downloadMergeXlsx(parsed, adminFeaturesStore.pcodeLabelMap ?? {}, `${baseName}_merged.xlsx`);
	}

	// One row per UoA: conclusion key first, then PF→conclusion fallback for unfilled ZIPs.
	const mapRows = $derived.by(() => {
		if (!parsed) return [];
		const byUoa = new Map<string, { uoa: string; priority_flag: string }>();
		for (const r of parsed.synthesis) {
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
		parsed
			? [...new Set(parsed.synthesis.filter((r) => !r.deepDiveRun).map((r) => r.uoa))].filter(
					(uoa) => {
						const rows = parsed!.synthesis.filter((r) => r.uoa === uoa);
						return (
							rows.every((r) => !r.deepDiveRun) &&
							rows.some((r) => {
								const k = priorityFlagToConclusion(r.priorityFlag);
								return k !== null && k !== 'no_data';
							})
						);
					}
				)
			: []
	);

	const hasGeo = $derived(adminFeaturesStore.adm1 !== null);
	const mapLevel = $derived<'ADM1' | 'ADM2' | 'MIXED'>(adminFeaturesStore.adm2 ? 'MIXED' : 'ADM1');

	function toKey(s: string): string {
		return s
			.toLowerCase()
			.replace(/\s+/g, '_')
			.replace(/[^a-z0-9_]/g, '');
	}

	// One row per UoA, per-system fields as pivot columns
	const uoaTableRows = $derived.by(() => {
		if (!parsed) return [] as Record<string, unknown>[];
		const seen = new Map<string, Record<string, unknown>>();
		for (const r of parsed.synthesis) {
			if (!seen.has(r.uoa)) {
				seen.set(r.uoa, {
					uoa: r.uoa,
					admin_name: adminFeaturesStore.pcodeLabelMap?.[r.uoa] ?? '',
					priority_flag: r.priorityFlag,
					conclusion: r.conclusion,
					deep_dive_run: r.deepDiveRun
				});
			}
			const prefix = toKey(r.tab) + '_' + toKey(r.system);
			const row = seen.get(r.uoa)!;
			row[prefix + '_primary_hypothesis'] = r.primaryHypothesis;
			row[prefix + '_secondary_hypothesis'] = r.secondaryHypothesis;
			row[prefix + '_plausibility'] = r.plausibility;
			row[prefix + '_summary'] = r.summary;
			row[prefix + '_triangulation'] = r.triangulation;
		}
		return [...seen.values()];
	});
</script>

<div class="mx-auto max-w-5xl px-4 py-8">
	<PageHeader
		title="Merge deep-dives"
		subtitle="Upload the filled-in deep-dive ZIP to consolidate analytical conclusions into a single XLSX."
	/>

	<Uploader
		size="lg"
		accept=".zip"
		dropText="Drop your filled-in deep-dives ZIP here"
		detailsMode="collapse"
		process={processMergeZip}
		oncleared={onMergeCleared}
	/>

	<!-- Results -->
	{#if parsed}
		<div class="mt-6 space-y-4">
			<!-- Summary badges -->
			<div class="flex flex-wrap items-center gap-2">
				<span class="badge badge-neutral">{parsed.uoaCount} UoAs</span>
				<span class="badge badge-neutral">{parsed.systemCount} systems</span>
				<span class="badge badge-neutral">{parsed.synthesis.length} synthesis rows</span>
			</div>

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
					humanizeHeaders
					searchable
					downloadable
					downloadFilename="synthesis"
					overflow="paginate"
					pageSize={20}
				/>
			{/if}

			<!-- Export button -->
			<button class="btn btn-primary" onclick={exportXlsx} disabled={!parsed.synthesis.length}>
				Export XLSX
			</button>
		</div>
	{/if}
</div>
