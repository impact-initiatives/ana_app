<script lang="ts">
	import {
		metricStore,
		applyCustomReference,
		clearCustomReference
	} from '$lib/stores/metricStore.svelte';
	import { parseReferenceCsvText, validateRefRows } from '$lib/engine/referenceBuilder';
	import { mergeCustomRows } from '$lib/engine/referenceMerger';
	import Uploader, { type ProcessResult } from '$lib/components/data/Uploader.svelte';
	import { buildReferenceRows } from '$lib/engine/metricMetadata';

	// ── Local state ───────────────────────────────────────────────────────────

	let detailsModal = $state<HTMLDialogElement | null>(null);

	let uploaderKey = $state(0);
	let readyToApply = $state(false);
	let isApplying = $state(false);
	let applyError = $state<string | null>(null);
	let open = $state(false);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let pendingRows = $state<any[]>([]);

	// ── File handling ─────────────────────────────────────────────────────────

	async function processRefCsv(file: File): Promise<ProcessResult> {
		pendingRows = [];

		const csvText = await file.text();
		const { rows, parseErrors: pe } = parseReferenceCsvText(csvText);

		if (pe.length > 0) {
			return {
				ok: false,
				summary: `${pe.length} parse error${pe.length !== 1 ? 's' : ''}`,
				details: [{ label: 'Parse errors', type: 'error', items: pe }]
			};
		}

		const baseJson = metricStore.referenceJson;
		if (!baseJson) {
			return { ok: false, summary: 'Base reference not loaded — try again in a moment.' };
		}

		const { errors, warnings } = validateRefRows(rows, baseJson as Record<string, unknown>);

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

		// Dry-run merge to get preview stats and post-merge warnings (not persisted yet)
		const base = JSON.parse(JSON.stringify(baseJson)) as Record<string, unknown>;
		const { stats, warnings: mergeWarnings } = mergeCustomRows(base, rows);
		pendingRows = rows;

		const summary = `${stats.updated.length} to update · ${stats.added.length} to add`;
		const details: ProcessResult['details'] = [];
		if (warnings.length) details.push({ label: 'Warnings', type: 'warning', items: warnings });
		if (mergeWarnings.length)
			details.push({ label: 'Reference warnings', type: 'warning', items: mergeWarnings });

		return { ok: true, summary, details: details.length ? details : undefined };
	}

	function onRefAccepted() {
		readyToApply = true;
	}

	function clearFile() {
		pendingRows = [];
		readyToApply = false;
		isApplying = false;
		applyError = null;
	}

	// ── Apply / Reset ─────────────────────────────────────────────────────────

	async function handleApply() {
		if (!pendingRows.length || !metricStore.referenceJson) return;
		isApplying = true;
		applyError = null;
		try {
			const base = JSON.parse(JSON.stringify(metricStore.referenceJson)) as Record<string, unknown>;
			const { mergedJson, mergedMetricMap, stats, errors } = mergeCustomRows(base, pendingRows);
			if (errors.length > 0) {
				applyError = `Validation failed (${errors.length} error${errors.length !== 1 ? 's' : ''}):\n${errors.join('\n')}`;
				isApplying = false;
				return;
			}
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			applyCustomReference(mergedJson as Record<string, any>, mergedMetricMap, stats, pendingRows);
			open = false;
			clearFile();
			uploaderKey++; // reset Uploader to idle
		} catch (e) {
			applyError = e instanceof Error ? e.message : String(e);
			isApplying = false;
		}
	}

	async function handleReset() {
		await clearCustomReference();
		clearFile();
		uploaderKey++;
	}

	// ── Details modal / CSV download ──────────────────────────────────────────

	function downloadMergedCsv() {
		if (!metricStore.referenceJson) return;
		const rows = buildReferenceRows(metricStore.referenceJson);
		const headers = [
			'MET_ID',
			'Level',
			'System',
			'Factor',
			'Sub-Factor',
			'Indicator',
			'Preference',
			'Type',
			'Metric',
			'MSNA module',
			'MSNA indicator',
			'Question KOBO Code',
			'Remarks/Limitations',
			'Acute needs threshold (4)',
			'Very acute needs threshold (5)',
			'Above or below',
			'Evidence threshold',
			'Factor threshold',
			'Risk concept'
		];
		const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
		const csv = [
			headers.join(','),
			...rows.map((r) =>
				[
					r.metric,
					r.level,
					r.system,
					r.factor,
					r.subfactor,
					r.indicator,
					r.preference,
					r.type,
					r.label,
					r.msna_module,
					r.msna_indicator,
					r.question_kobo_code,
					r.remarks_limitations,
					r.threshold_an,
					r.threshold_van,
					r.above_or_below,
					r.evidence_threshold,
					r.factor_threshold,
					r.risk_concept
				]
					.map(esc)
					.join(',')
			)
		].join('\n');
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'reference-custom-full.csv';
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<!-- ── Collapsible card — details/summary variant avoids click-propagation issues ── -->
<details class="collapse-arrow bg-base-100 border-base-300 collapse border" bind:open>
	<summary class="collapse-title min-h-0 cursor-pointer py-3 select-none">
		<div class="flex flex-wrap items-center gap-2">
			<h3 class="text-sm font-semibold">Customise reference</h3>
			{#if metricStore.customReferenceActive && metricStore.customMergeStats}
				<span class="badge badge-warning badge-sm">Custom reference active</span>
				<span class="badge badge-info badge-sm">
					{metricStore.customMergeStats.updated.length} updated
				</span>
				<span class="badge badge-success badge-sm">
					{metricStore.customMergeStats.added.length} added
				</span>
			{/if}
		</div>
	</summary>

	<div class="collapse-content space-y-3 pt-0 pb-3">
		{#if metricStore.customReferenceActive && metricStore.customMergeStats}
			<div
				class="border-warning/20 bg-warning/6 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
			>
				<span class="text-base-content/70 text-xs">
					{#if metricStore.customAppliedAt}
						Applied {new Date(metricStore.customAppliedAt).toLocaleString()}
					{/if}
				</span>
				<div class="flex items-center gap-1">
					<button
						class="btn btn-ghost btn-xs cursor-pointer"
						onclick={() => detailsModal?.showModal()}
					>
						More details
					</button>
					<button class="btn btn-ghost btn-xs cursor-pointer" onclick={handleReset}>
						Reset to default
					</button>
				</div>
			</div>
		{/if}
		<p class="text-base-content/85 text-xs">
			Upload a reference CSV to update thresholds, labels, or add country-specific metrics. Only
			rows you include are changed — unmentioned metrics stay unchanged.
		</p>
		<div role="alert" class="alert alert-info alert-soft text-xs">
			Please contact AU HQ team before changing the reference list. Thanks!
		</div>

		{#key uploaderKey}
			<Uploader
				size="sm"
				accept=".csv"
				detailsMode="collapse"
				process={processRefCsv}
				onaccepted={onRefAccepted}
				oncleared={clearFile}
			/>
		{/key}

		<!-- Apply error -->
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

		<!-- Apply / applying -->
		{#if isApplying}
			<div class="flex items-center gap-2.5 py-1">
				<span class="loading loading-spinner loading-xs text-primary"></span>
				<span class="text-base-content/75 text-sm">Applying…</span>
			</div>
		{:else if readyToApply}
			<button class="btn btn-primary btn-sm w-full cursor-pointer" onclick={handleApply}>
				Apply custom reference
			</button>
		{/if}
	</div>
</details>

<!-- ── Details modal ─────────────────────────────────────────────────────────── -->
<dialog bind:this={detailsModal} class="modal">
	<div class="modal-box max-w-lg">
		<!-- Header -->
		<div class="mb-4 flex items-start justify-between gap-4">
			<div>
				<h3 class="text-base font-semibold">Custom reference details</h3>
				{#if metricStore.customAppliedAt}
					<p class="text-base-content/60 mt-0.5 text-xs">
						Applied {new Date(metricStore.customAppliedAt).toLocaleString()}
					</p>
				{/if}
			</div>
			<form method="dialog">
				<button class="btn btn-circle btn-ghost btn-outline btn-xs" aria-label="Close">✕</button>
			</form>
		</div>

		<!-- Stats -->
		{#if metricStore.customMergeStats}
			<div class="mb-4 flex flex-wrap gap-2">
				<span class="badge badge-info badge-sm">
					{metricStore.customMergeStats.updated.length} updated
				</span>
				<span class="badge badge-success badge-sm">
					{metricStore.customMergeStats.added.length} added
				</span>
			</div>

			<!-- Updated list -->
			{#if metricStore.customMergeStats.updated.length > 0}
				<div class="mb-4">
					<p class="text-base-content/75 mb-1.5 text-xs font-semibold tracking-wide uppercase">
						Updated ({metricStore.customMergeStats.updated.length})
					</p>
					<div class="bg-base-200 max-h-44 space-y-1 overflow-y-auto rounded-lg p-2">
						{#each metricStore.customMergeStats.updated as id (id)}
							<div class="flex items-baseline gap-2 text-xs">
								<code class="text-warning shrink-0 font-mono">{id}</code>
								<span class="text-base-content/75 truncate">
									{metricStore.metricMap[id]?.label ?? ''}
								</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Added list -->
			{#if metricStore.customMergeStats.added.length > 0}
				<div class="mb-4">
					<p class="text-base-content/75 mb-1.5 text-xs font-semibold tracking-wide uppercase">
						Added ({metricStore.customMergeStats.added.length})
					</p>
					<div class="bg-base-200 max-h-44 space-y-1 overflow-y-auto rounded-lg p-2">
						{#each metricStore.customMergeStats.added as id (id)}
							<div class="flex items-baseline gap-2 text-xs">
								<code class="text-success shrink-0 font-mono">{id}</code>
								<span class="text-base-content/75 truncate">
									{metricStore.metricMap[id]?.label ?? ''}
								</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		{/if}

		<!-- Actions -->
		<div class="modal-action">
			<button class="btn btn-primary btn-sm cursor-pointer" onclick={downloadMergedCsv}>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="size-4"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
					<polyline points="7 10 12 15 17 10" />
					<line x1="12" y1="3" x2="12" y2="15" />
				</svg>
				Download updated reference CSV
			</button>
			<form method="dialog">
				<button class="btn btn-ghost btn-sm cursor-pointer">Close</button>
			</form>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button>close</button>
	</form>
</dialog>
