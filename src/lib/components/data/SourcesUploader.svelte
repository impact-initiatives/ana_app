<script lang="ts">
	import { asset } from '$app/paths';
	import {
		metricSourcesStore,
		setMetricSources,
		clearMetricSources
	} from '$lib/stores/metricSourcesStore.svelte';
	import {
		parseMetricSourcesCsv,
		validateMetricSourceRows,
		buildMetricSourcesMap
	} from '$lib/engine/metricSourcesValidator';
	import { metricStore } from '$lib/stores/metricStore.svelte';
	import { flagStore } from '$lib/stores/flagStore.svelte';
	import Uploader, { type ProcessResult } from '$lib/components/data/Uploader.svelte';
	import InfoButton from '$lib/components/ui/InfoButton.svelte';
	import InfoModal, { type InfoItem } from '$lib/components/ui/InfoModal.svelte';

	// ── Local state ───────────────────────────────────────────────────────────

	let showFormatModal = $state(false);
	let uploaderKey = $state(0);
	let readyToApply = $state(false);
	let applyError = $state<string | null>(null);
	let open = $state(false);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let pendingResult = $state<{ rows: any[]; filename: string } | null>(null);

	// ── File handling ─────────────────────────────────────────────────────────

	async function processSourcesCsv(file: File): Promise<ProcessResult> {
		pendingResult = null;

		const csvText = await file.text();
		const { rows, parseErrors } = parseMetricSourcesCsv(csvText);

		if (parseErrors.length > 0) {
			return {
				ok: false,
				summary: `${parseErrors.length} parse error${parseErrors.length !== 1 ? 's' : ''}`,
				details: [{ label: 'Parse errors', type: 'error', items: parseErrors }]
			};
		}

		if (rows.length === 0) {
			return { ok: false, summary: 'No data rows found in the file.' };
		}

		const metricMap = metricStore.metricMap;
		const flaggedUoas = (flagStore.flaggedResult ?? []).map((r: Record<string, unknown>) =>
			String(r['uoa'] ?? '')
		);

		const { errors, warnings } = validateMetricSourceRows(rows, metricMap, flaggedUoas);

		if (errors.length > 0) {
			const details: ProcessResult['details'] = [
				{ label: 'Validation errors', type: 'error', items: errors }
			];
			if (warnings.length) details.push({ label: 'Warnings', type: 'warning', items: warnings });
			return {
				ok: false,
				summary: `${errors.length} validation error${errors.length !== 1 ? 's' : ''}`,
				details
			};
		}

		const map = buildMetricSourcesMap(rows);
		pendingResult = { rows, filename: file.name };

		const entryCount = Object.keys(map).length;
		const summary = `${rows.length} source${rows.length !== 1 ? 's' : ''} · ${entryCount} metric-UoA entries`;
		const details: ProcessResult['details'] = warnings.length
			? [{ label: 'Warnings', type: 'warning', items: warnings }]
			: undefined;

		return { ok: true, summary, details };
	}

	function onSourcesAccepted() {
		readyToApply = true;
	}

	function clearFile() {
		pendingResult = null;
		readyToApply = false;
		applyError = null;
	}

	// ── Apply / Clear ─────────────────────────────────────────────────────────

	function handleApply() {
		if (!pendingResult) return;
		applyError = null;
		try {
			const map = buildMetricSourcesMap(pendingResult.rows);
			setMetricSources(map, pendingResult.rows, pendingResult.filename);
			open = false;
			clearFile();
			uploaderKey++;
		} catch (e) {
			applyError = e instanceof Error ? e.message : String(e);
		}
	}

	function handleClear() {
		clearMetricSources();
		clearFile();
		uploaderKey++;
	}

	// ── Format modal data ─────────────────────────────────────────────────────

	const sourceInfoItems = [
		{
			id: 'source',
			title: 'source',
			badgeType: 'required',
			content: 'Name of the data source (e.g. "MSNA 2024", "SMART survey").'
		},
		{
			id: 'metric-ids',
			title: 'metric_ids',
			badgeType: 'required',
			content:
				'Comma-separated metric IDs, e.g. MET001,MET002,MET005 for which data is provided in this source.'
		},
		{
			id: 'link',
			title: 'link',
			badgeType: 'optional',
			content:
				'URL to the dataset, a website, a report, or if not public, further details about the source.'
		},

		{
			id: 'uoa',
			title: 'uoa',
			badgeType: 'optional',
			content:
				'If left blank, the source applies to all UoAs. If a source applies to a given set of UoAs, list them separated by commas, e.g. AF26,AF27,AF31.'
		},
		{
			id: 'start-date',
			title: 'start_of_data_collection',
			badgeType: 'optional',
			content:
				'When data collection started, e.g. 2024-01-01. Must be a valid date in YYYY-MM-DD format.'
		},
		{
			id: 'end-date',
			title: 'end_of_data_collection',
			badgeType: 'optional',
			content:
				'When data collection ended, e.g. 2024-06-30. Must be a valid date in YYYY-MM-DD format.'
		}
	] satisfies InfoItem[];

	const sourceInfoTop = {
		messagePrefix: 'Download the CSV',
		href: asset('/data/input_good_sources.csv'),
		text: 'template',
		suffix: '. And read the below for information on how to fill in.'
	};
</script>

<!-- ── Collapsible card ─────────────────────────────────────────────────────── -->
<details class="collapse-arrow bg-base-100 border-base-300 collapse border" bind:open>
	<summary class="collapse-title min-h-0 cursor-pointer py-3 select-none">
		<div class="flex flex-wrap items-center gap-2">
			<h3 class="text-sm font-semibold">Metric sources</h3>
			{#if metricSourcesStore.sourcesMap}
				<span class="badge badge-info badge-sm">
					{metricSourcesStore.entryCount} entr{metricSourcesStore.entryCount === 1 ? 'y' : 'ies'}
				</span>
			{/if}
		</div>
	</summary>

	<div class="collapse-content space-y-3 pt-0 pb-3">
		{#if metricSourcesStore.sourcesMap}
			<div
				class="border-info/20 bg-info/6 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
			>
				<span class="text-base-content/70 text-xs">
					{metricSourcesStore.filename ?? ''}
					{#if metricSourcesStore.uploadedAt}
						· {new Date(metricSourcesStore.uploadedAt).toLocaleString()}
					{/if}
				</span>
				<button class="btn btn-ghost btn-xs cursor-pointer" onclick={handleClear}> Clear </button>
			</div>
		{/if}

		<div>
			<div class="flex items-start justify-between gap-15">
				<p class="text-base-content/85 mb-2 text-xs">
					Upload your CSV which contains data sources, metrics, UoAs, link to resource, and
					collection dates.
				</p>
				<InfoButton
					label="Format"
					onclick={() => (showFormatModal = true)}
					title="Sources format reference"
					size="xs"
				/>
			</div>

			<div role="alert" class="alert alert-info alert-soft mt-2 mb-2 text-xs">
				Used to nicely populate extra columns in deep-dive XLSX exports.
			</div>
		</div>

		{#key uploaderKey}
			<Uploader
				size="sm"
				accept=".csv"
				detailsMode="collapse"
				process={processSourcesCsv}
				onaccepted={onSourcesAccepted}
				oncleared={clearFile}
			/>
		{/key}

		{#if applyError}
			<div class="bg-error/6 border-error/20 rounded-lg border px-3 py-2.5">
				<p class="text-error text-xs font-semibold">Apply failed</p>
				<p class="text-error mt-1 text-xs">{applyError}</p>
				<button
					class="text-base-content/60 hover:text-base-content mt-2 cursor-pointer text-xs underline underline-offset-2"
					onclick={() => (applyError = null)}
				>
					Dismiss
				</button>
			</div>
		{/if}

		{#if readyToApply}
			<button class="btn btn-primary btn-sm w-full cursor-pointer" onclick={handleApply}>
				Apply metric sources
			</button>
		{/if}
	</div>
</details>

<InfoModal
	bind:isOpen={showFormatModal}
	title="Metric sources CSV format"
	description="One row per data source"
	items={sourceInfoItems}
	topInfo={sourceInfoTop}
/>
