<script lang="ts">
	import { adminFeaturesStore } from '$lib/stores/adminFeaturesStore.svelte';
	import {
		parseMergeZip,
		downloadMergeXlsx,
		type ParsedMergeResult
	} from '$lib/engine/mergeDeepDives';
	import Uploader, { type ProcessResult } from '$lib/components/data/Uploader.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import DataTable from '$lib/components/ui/DataTable.svelte';

	let parsed = $state<ParsedMergeResult | null>(null);
	let exportFileName = $state('');

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

	const previewRows = $derived(
		(parsed?.synthesis.slice(0, 5) ?? []) as unknown as Record<string, unknown>[]
	);
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
				<span class="badge badge-neutral">{parsed.metricScores.length} metric scores</span>
			</div>

			<!-- Preview table -->
			{#if previewRows.length}
				<DataTable
					rows={previewRows}
					tableClass="table-xs"
					headerRowClass="text-base-content text-xs"
					humanizeHeaders
				></DataTable>
			{:else}
				<div role="alert" class="alert alert-warning">
					<span class="text-sm">No well-filled conclusions found in the uploaded ZIP.</span>
				</div>
			{/if}

			<!-- Export button -->
			<button class="btn btn-primary" onclick={exportXlsx} disabled={!parsed.synthesis.length}>
				Export XLSX
			</button>
		</div>
	{/if}
</div>
