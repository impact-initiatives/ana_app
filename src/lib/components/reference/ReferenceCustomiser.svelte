<script lang="ts">
	import { metricStore, applyCustomReference, clearCustomReference } from '$lib/stores/metricStore.svelte';
	import { parseReferenceCsvText, validateRefRows } from '$lib/engine/referenceBuilder';
	import { mergeCustomRows } from '$lib/engine/referenceMerger';
	import ButtonClear from '$lib/components/ui/ButtonClear.svelte';

	// ── Local state ───────────────────────────────────────────────────────────

	type UploadStatus = 'idle' | 'validating' | 'ready' | 'errors' | 'applying' | 'applied';

	let fileInput = $state<HTMLInputElement | null>(null);
	let fileName = $state('');
	let status = $state<UploadStatus>('idle');
	let isDragging = $state(false);
	let parseErrors = $state<string[]>([]);
	let validationErrors = $state<string[]>([]);
	let validationWarnings = $state<string[]>([]);
	let previewStats = $state<{ updated: number; added: number } | null>(null);
	let applyError = $state<string | null>(null);
	let open = $state(false);

	// Parsed rows held in memory until Apply is clicked
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
			const { stats } = mergeCustomRows(baseJson as Record<string, unknown>, rows);
			previewStats = { updated: stats.updated.length, added: stats.added.length };
			pendingRows = rows;
			status = 'ready';
		} catch (e) {
			validationErrors = [e instanceof Error ? e.message : String(e)];
			status = 'errors';
		}
	}

	function onInputChange(e: Event) {
		const files = (e.target as HTMLInputElement).files;
		if (files?.[0]) handleFile(files[0]);
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
		const file = e.dataTransfer?.files?.[0];
		if (file) handleFile(file);
	}

	function triggerBrowse() {
		if (status === 'idle' || status === 'errors') fileInput?.click();
	}

	function clearFile() {
		if (fileInput) fileInput.value = '';
		fileName = '';
		status = 'idle';
		isDragging = false;
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
			const baseJson = metricStore.referenceJson as Record<string, unknown>;
			const { mergedJson, mergedMetricMap, stats, zodErrors } = mergeCustomRows(baseJson, pendingRows);
			if (zodErrors.length > 0) {
				applyError = `Merged reference failed structural validation:\n${zodErrors.join('\n')}`;
				status = 'errors';
				return;
			}
			applyCustomReference(mergedJson as Record<string, any>, mergedMetricMap, stats, pendingRows);
			status = 'applied';
			open = false;
		} catch (e) {
			applyError = e instanceof Error ? e.message : String(e);
			status = 'errors';
		}
	}

	async function handleReset() {
		await clearCustomReference();
		clearFile();
	}
</script>

<!-- ── Active badge (always visible when custom reference is on) ────────────── -->
{#if metricStore.customReferenceActive && metricStore.customMergeStats}
	<div class="border-warning/30 bg-warning/8 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
		<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
			<span class="badge badge-warning badge-sm">Custom reference active</span>
			<span class="text-base-content/80 text-xs">
				{metricStore.customMergeStats.updated.length} updated · {metricStore.customMergeStats.added.length} added
				{#if metricStore.customAppliedAt}
					· applied {new Date(metricStore.customAppliedAt).toLocaleString()}
				{/if}
			</span>
		</div>
		<button
			class="btn btn-ghost btn-xs cursor-pointer"
			onclick={handleReset}
		>
			Reset to default
		</button>
	</div>
{/if}

<!-- ── Collapsible customise section ─────────────────────────────────────────── -->
<details bind:open class="group">
	<summary
		class="text-base-content/70 hover:text-base-content flex cursor-pointer select-none list-none items-center gap-1.5 text-xs font-medium transition-colors duration-150"
		aria-expanded={open}
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class={['size-3 transition-transform duration-150', open ? 'rotate-90' : ''].join(' ')}
			viewBox="0 0 20 20"
			fill="currentColor"
			aria-hidden="true"
		>
			<path
				fill-rule="evenodd"
				d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
				clip-rule="evenodd"
			/>
		</svg>
		Customise reference
	</summary>

	<div class="mt-2 space-y-3">
		<p class="text-base-content/65 text-xs">
			Upload a reference CSV to update thresholds, labels, or add country-specific metrics.
			Only changes rows you include — unmentioned metrics are unchanged.
		</p>

		<!-- Hidden file input -->
		<input
			bind:this={fileInput}
			type="file"
			accept=".csv"
			onchange={onInputChange}
			class="sr-only"
			aria-label="Choose a reference CSV file"
		/>

		<!-- Drop zone -->
		{#if status === 'idle' || status === 'errors'}
			<div
				role="button"
				tabindex="0"
				aria-label={isDragging ? 'Drop to upload' : 'Drop a reference CSV or click to browse'}
				class={[
					'rounded-box flex items-center gap-3 border-2 border-dashed px-4 py-3 text-sm transition-colors duration-150',
					isDragging
						? 'border-primary bg-primary/8 cursor-copy'
						: 'border-base-300 hover:border-primary/60 cursor-pointer'
				].join(' ')}
				ondrop={onDrop}
				ondragover={(e) => { e.preventDefault(); isDragging = true; }}
				ondragleave={() => { isDragging = false; }}
				onclick={triggerBrowse}
				onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') triggerBrowse(); }}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-primary size-5 shrink-0"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
					<polyline points="17 8 12 3 7 8" />
					<line x1="12" y1="3" x2="12" y2="15" />
				</svg>
				<span class="text-base-content/70">
					{isDragging ? 'Drop to upload' : 'Drop a reference CSV here, or click to browse'}
				</span>
			</div>
		{:else if status === 'validating'}
			<div class="flex items-center gap-2.5 py-2">
				<span class="loading loading-spinner loading-xs text-primary"></span>
				<span class="text-base-content/75 text-sm">Validating…</span>
			</div>
		{:else if status === 'applying'}
			<div class="flex items-center gap-2.5 py-2">
				<span class="loading loading-spinner loading-xs text-primary"></span>
				<span class="text-base-content/75 text-sm">Applying…</span>
			</div>
		{:else if status === 'ready' || status === 'applied'}
			<div class="border-success/30 bg-success/6 flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
				<div class="min-w-0">
					<p class="text-success truncate text-sm font-semibold">{fileName}</p>
					{#if previewStats}
						<p class="text-base-content/70 text-xs">
							{previewStats.updated} metric{previewStats.updated !== 1 ? 's' : ''} to update
							· {previewStats.added} to add
						</p>
					{/if}
				</div>
				<div role="presentation" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
					<ButtonClear size="sm" onclick={clearFile} />
				</div>
			</div>
		{/if}

		<!-- Parse/validation errors -->
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
				{#if fileName}
					<button class="text-base-content/60 hover:text-base-content mt-2 cursor-pointer text-xs underline underline-offset-2" onclick={clearFile}>
						Clear and try again
					</button>
				{/if}
			</div>
		{/if}

		<!-- Warnings (non-blocking) -->
		{#if validationWarnings.length > 0 && validationErrors.length === 0}
			<div class="bg-warning/6 border-warning/20 rounded-lg border px-3 py-2.5">
				<p class="text-warning text-xs font-semibold">{validationWarnings.length} warning{validationWarnings.length !== 1 ? 's' : ''}</p>
				<ul class="text-base-content/80 mt-1 list-disc pl-4 text-xs">
					{#each validationWarnings as w (w)}
						<li>{w}</li>
					{/each}
				</ul>
			</div>
		{/if}

		<!-- Apply button -->
		{#if status === 'ready'}
			<button
				class="btn btn-primary btn-sm w-full cursor-pointer"
				onclick={handleApply}
			>
				Apply custom reference
			</button>
		{/if}
	</div>
</details>
