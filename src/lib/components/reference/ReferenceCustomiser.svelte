<script lang="ts">
	import {
		metricStore,
		applyCustomReference,
		clearCustomReference
	} from '$lib/stores/metricStore.svelte';
	import { parseReferenceCsvText, validateRefRows } from '$lib/engine/referenceBuilder';
	import { mergeCustomRows } from '$lib/engine/referenceMerger';
	import ButtonClear from '$lib/components/ui/ButtonClear.svelte';
	import CsvUploader from '$lib/components/data/CsvUploader.svelte';
	import { buildReferenceRows } from '$lib/engine/metricMetadata';

	// ── Local state ───────────────────────────────────────────────────────────

	type UploadStatus = 'idle' | 'validating' | 'ready' | 'errors' | 'applying';

	let detailsModal = $state<HTMLDialogElement | null>(null);

	let fileName = $state('');
	let status = $state<UploadStatus>('idle');
	let parseErrors = $state<string[]>([]);
	let validationErrors = $state<string[]>([]);
	let validationWarnings = $state<string[]>([]);
	let previewStats = $state<{ updated: number; added: number } | null>(null);
	let applyError = $state<string | null>(null);
	let open = $state(false);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let pendingRows = $state<any[]>([]);

	// ── File handling ─────────────────────────────────────────────────────────

	async function handleFile(file: File) {
		fileName = file.name;
		status = 'validating';
		parseErrors = [];
		validationErrors = [];
		validationWarnings = [];
		previewStats = null;
		applyError = null;
		pendingRows = [];

		try {
			const csvText = await file.text();
			const { rows, parseErrors: pe } = parseReferenceCsvText(csvText);

			if (pe.length > 0) {
				parseErrors = pe;
				status = 'errors';
				return;
			}

			const baseJson = metricStore.referenceJson;
			if (!baseJson) {
				validationErrors = ['Base reference not loaded — try again in a moment.'];
				status = 'errors';
				return;
			}

			const { errors, warnings } = validateRefRows(rows, baseJson as Record<string, unknown>);
			validationWarnings = warnings;

			if (errors.length > 0) {
				validationErrors = errors;
				status = 'errors';
				return;
			}

			// Dry-run merge to get preview stats (not persisted yet)
			const base = JSON.parse(JSON.stringify(baseJson)) as Record<string, unknown>;
			const { stats } = mergeCustomRows(base, rows);
			previewStats = { updated: stats.updated.length, added: stats.added.length };
			pendingRows = rows;
			status = 'ready';
		} catch (e) {
			validationErrors = [e instanceof Error ? e.message : String(e)];
			status = 'errors';
		}
	}

	function clearFile() {
		fileName = '';
		status = 'idle';
		parseErrors = [];
		validationErrors = [];
		validationWarnings = [];
		previewStats = null;
		applyError = null;
		pendingRows = [];
	}

	// ── Apply / Reset ─────────────────────────────────────────────────────────

	async function handleApply() {
		if (!pendingRows.length || !metricStore.referenceJson) return;
		status = 'applying';
		applyError = null;
		try {
			const base = JSON.parse(JSON.stringify(metricStore.referenceJson)) as Record<string, unknown>;
			const { mergedJson, mergedMetricMap, stats, zodErrors } = mergeCustomRows(base, pendingRows);
			if (zodErrors.length > 0) {
				applyError = `Merged reference failed structural validation:\n${zodErrors.join('\n')}`;
				status = 'errors';
				return;
			}
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			applyCustomReference(mergedJson as Record<string, any>, mergedMetricMap, stats, pendingRows);
			open = false;
			clearFile();
		} catch (e) {
			applyError = e instanceof Error ? e.message : String(e);
			status = 'errors';
		}
	}

	async function handleReset() {
		await clearCustomReference();
		clearFile();
	}

	// ── Details modal / CSV download ──────────────────────────────────────────

	function downloadMergedCsv() {
		if (!metricStore.referenceJson) return;
		const rows = buildReferenceRows(metricStore.referenceJson);
		const headers = [
			'MET_ID', 'Level', 'System', 'Factor', 'Sub-Factor', 'Indicator',
			'Preference', 'Type', 'Metric', 'MSNA module', 'MSNA indicator',
			'Question KOBO Code', 'Remarks/Limitations',
			'Acute needs threshold (4)', 'Very acute needs threshold (5)',
			'Above or below', 'Evidence threshold', 'Factor threshold', 'Risk concept'
		];
		const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
		const csv = [
			headers.join(','),
			...rows.map((r) =>
				[
					r.metric, r.level, r.system, r.factor, r.subfactor, r.indicator,
					r.preference, r.type, r.label, r.msna_module, r.msna_indicator,
					r.question_kobo_code, r.remarks_limitations,
					r.threshold_an, r.threshold_van,
					r.above_or_below, r.evidence_threshold, r.factor_threshold, r.risk_concept
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

<!-- ── Active badge ───────────────────────────────────────────────────────────── -->
{#if metricStore.customReferenceActive && metricStore.customMergeStats}
	<div
		class="border-warning/30 bg-warning/8 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
	>
		<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
			<span class="badge badge-warning badge-sm">Custom reference active</span>
			<span class="text-base-content/80 text-xs">
				{metricStore.customMergeStats.updated.length} updated · {metricStore.customMergeStats.added
					.length} added
				{#if metricStore.customAppliedAt}
					· applied {new Date(metricStore.customAppliedAt).toLocaleString()}
				{/if}
			</span>
		</div>
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

<!-- ── Collapsible card — details/summary variant avoids click-propagation issues ── -->
<details class="collapse collapse-arrow bg-base-100 border-base-300 border" bind:open>
	<summary class="collapse-title min-h-0 cursor-pointer select-none py-3">
		<h3 class="text-sm font-semibold">Customise reference</h3>
	</summary>

	<div class="collapse-content space-y-3 pb-3 pt-0">
		<p class="text-base-content/65 text-xs">
			Upload a reference CSV to update thresholds, labels, or add country-specific metrics.
			Only rows you include are changed — unmentioned metrics stay unchanged.
		</p>

		<!-- Drop zone — only visible in idle state; other states replace it below -->
		{#if status === 'idle'}
			<CsvUploader size="sm" onparsed={(result) => handleFile(result.file)} oncleared={clearFile} />
		{:else if status === 'validating' || status === 'applying'}
			<div class="flex items-center gap-2.5 py-2">
				<span class="loading loading-spinner loading-xs text-primary"></span>
				<span class="text-base-content/75 text-sm">
					{status === 'validating' ? 'Validating…' : 'Applying…'}
				</span>
			</div>
		{:else if status === 'ready'}
			<div
				class="border-success/30 bg-success/6 flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
			>
				<div class="min-w-0">
					<p class="text-success truncate text-sm font-semibold">{fileName}</p>
					{#if previewStats}
						<p class="text-base-content/70 text-xs">
							{previewStats.updated} metric{previewStats.updated !== 1 ? 's' : ''} to update
							· {previewStats.added} to add
						</p>
					{/if}
				</div>
				<div
					role="presentation"
					onclick={(e) => e.stopPropagation()}
					onkeydown={(e) => e.stopPropagation()}
				>
					<ButtonClear size="sm" onclick={clearFile} />
				</div>
			</div>
		{/if}

		<!-- Parse / validation errors -->
		{#if parseErrors.length > 0 || validationErrors.length > 0 || applyError}
			<div class="bg-error/6 border-error/20 rounded-lg border px-3 py-2.5">
				<p class="text-error text-xs font-semibold">
					{parseErrors.length > 0 ? 'Parse errors' : 'Validation errors'}
				</p>
				<ul class="text-error mt-1 list-disc pl-4 text-xs">
					{#each [...parseErrors, ...validationErrors] as err (err)}
						<li>{err}</li>
					{/each}
					{#if applyError}
						<li>{applyError}</li>
					{/if}
				</ul>
				<button
					class="text-base-content/60 hover:text-base-content mt-2 cursor-pointer text-xs underline underline-offset-2"
					onclick={clearFile}
				>
					Clear and try again
				</button>
			</div>
		{/if}

		<!-- Warnings (non-blocking) -->
		{#if validationWarnings.length > 0 && validationErrors.length === 0}
			<div class="bg-warning/6 border-warning/20 rounded-lg border px-3 py-2.5">
				<p class="text-warning text-xs font-semibold">
					{validationWarnings.length} warning{validationWarnings.length !== 1 ? 's' : ''}
				</p>
				<ul class="text-base-content/80 mt-1 list-disc pl-4 text-xs">
					{#each validationWarnings as w (w)}
						<li>{w}</li>
					{/each}
				</ul>
			</div>
		{/if}

		<!-- Apply button -->
		{#if status === 'ready'}
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
				<span class="badge badge-warning badge-sm">
					{metricStore.customMergeStats.updated.length} updated
				</span>
				<span class="badge badge-success badge-sm">
					{metricStore.customMergeStats.added.length} added
				</span>
			</div>

			<!-- Updated list -->
			{#if metricStore.customMergeStats.updated.length > 0}
				<div class="mb-4">
					<p class="text-base-content/60 mb-1.5 text-xs font-semibold uppercase tracking-wide">
						Updated ({metricStore.customMergeStats.updated.length})
					</p>
					<div class="bg-base-200 max-h-44 space-y-1 overflow-y-auto rounded-lg p-2">
						{#each metricStore.customMergeStats.updated as id (id)}
							<div class="flex items-baseline gap-2 text-xs">
								<code class="text-warning shrink-0 font-mono">{id}</code>
								<span class="text-base-content/60 truncate">
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
					<p class="text-base-content/60 mb-1.5 text-xs font-semibold uppercase tracking-wide">
						Added ({metricStore.customMergeStats.added.length})
					</p>
					<div class="bg-base-200 max-h-44 space-y-1 overflow-y-auto rounded-lg p-2">
						{#each metricStore.customMergeStats.added as id (id)}
							<div class="flex items-baseline gap-2 text-xs">
								<code class="text-success shrink-0 font-mono">{id}</code>
								<span class="text-base-content/60 truncate">
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
				Download full reference CSV
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
