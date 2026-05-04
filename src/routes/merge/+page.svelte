<script lang="ts">
	import { adminFeaturesStore } from '$lib/stores/adminFeaturesStore.svelte';
	import {
		parseMergeZip,
		downloadMergeXlsx,
		type ParsedMergeResult
	} from '$lib/engine/mergeDeepDives';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import DataTable from '$lib/components/ui/DataTable.svelte';

	let fileInput = $state<HTMLInputElement | null>(null);
	let fileName = $state('');
	let status = $state<'idle' | 'parsing' | 'done' | 'error'>('idle');
	let isDragging = $state(false);
	let parsed = $state<ParsedMergeResult | null>(null);
	let errorMsg = $state('');
	let showWarns = $state(false);

	async function processFile(f: File) {
		fileName = f.name;
		parsed = null;
		errorMsg = '';
		status = 'parsing';
		try {
			parsed = await parseMergeZip(f);
			status = 'done';
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : String(e);
			status = 'error';
		}
	}

	function onInputChange(e: Event) {
		const f = (e.target as HTMLInputElement).files?.[0];
		if (f) processFile(f);
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
		const f = e.dataTransfer?.files[0];
		if (f && f.name.toLowerCase().endsWith('.zip')) processFile(f);
	}

	function onDragOver(e: DragEvent) {
		e.preventDefault();
		isDragging = true;
	}
	function onDragLeave() {
		isDragging = false;
	}

	function clearAll() {
		if (fileInput) fileInput.value = '';
		fileName = '';
		status = 'idle';
		isDragging = false;
		parsed = null;
		errorMsg = '';
		showWarns = false;
	}

	function triggerBrowse() {
		if (status === 'idle' || status === 'error') fileInput?.click();
	}

	function exportXlsx() {
		if (!parsed) return;
		const baseName = fileName.replace(/\.zip$/i, '') || 'deepdives';
		downloadMergeXlsx(parsed, adminFeaturesStore.pcodeLabelMap ?? {}, `${baseName}_merged.xlsx`);
	}

	const previewRows = $derived(parsed?.synthesis.slice(0, 5) ?? []);
</script>

<div class="mx-auto max-w-5xl px-4 py-8">
	<PageHeader
		title="Merge deep-dives"
		subtitle="Upload the filled-in deep-dive ZIP to consolidate analytical conclusions into a single XLSX."
	/>

	<!-- Hidden file input -->
	<input
		bind:this={fileInput}
		type="file"
		accept=".zip"
		onchange={onInputChange}
		class="sr-only"
		aria-label="Choose a ZIP file"
	/>

	<!-- Drop zone -->
	<div
		role="button"
		tabindex="0"
		aria-label={status === 'idle' ? 'Drop a ZIP file or click to browse' : fileName}
		class={[
			'rounded-box flex cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed px-6 py-14 text-center transition-colors duration-150',
			isDragging
				? 'border-primary bg-primary/8 cursor-copy'
				: status === 'done'
					? 'border-success/40 bg-success/5 cursor-default'
					: status === 'error'
						? 'border-error/40 bg-error/5'
						: 'border-base-300 hover:border-primary/80'
		].join(' ')}
		ondrop={onDrop}
		ondragover={onDragOver}
		ondragleave={onDragLeave}
		onclick={triggerBrowse}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') triggerBrowse();
		}}
	>
		<!-- Icon -->
		{#if status === 'parsing'}
			<span class="loading loading-spinner loading-md text-primary"></span>
		{:else if status === 'done'}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="text-success size-8"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
			</svg>
		{:else if status === 'error'}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="text-error size-8"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line
					x1="12"
					y1="16"
					x2="12.01"
					y2="16"
				/>
			</svg>
		{:else}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="text-primary size-8"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline
					points="17 8 12 3 7 8"
				/><line x1="12" y1="3" x2="12" y2="15" />
			</svg>
		{/if}

		<!-- Text -->
		{#if status === 'parsing'}
			<p>Parsing…</p>
		{:else if status === 'done'}
			<p class="text-success truncatefont-semibold">{fileName}</p>
			<p class="text-base-content/85">Parsed successfully — see results below</p>
		{:else if status === 'error'}
			<p class="text-error font-semibold">{fileName || 'Parse failed'}</p>
			<p class="text-base-content/85">{errorMsg || 'Click to try again'}</p>
		{:else}
			<p class="text-base-content/85 text-md">
				{isDragging ? 'Drop to upload' : 'Drop your filled-in deep-dives ZIP here'}
			</p>
			<p class="text-base-content/75 text-sm">or click to browse (.zip)</p>
		{/if}

		<!-- Clear button (click-isolated) -->
		{#if status === 'done' || status === 'error'}
			<div
				role="presentation"
				onclick={(e) => {
					e.stopPropagation();
					clearAll();
				}}
				onkeydown={(e) => e.stopPropagation()}
			>
				<button class="btn btn-outline btn-error btn-sm mt-1">Clear</button>
			</div>
		{/if}
	</div>

	<!-- Results -->
	{#if parsed}
		<div class="mt-6 space-y-4">
			<!-- Summary badges -->
			<div class="flex flex-wrap items-center gap-2">
				<span class="badge badge-neutral">{parsed.uoaCount} UoAs</span>
				<span class="badge badge-neutral">{parsed.systemCount} systems</span>
				<span class="badge badge-neutral">{parsed.synthesis.length} synthesis rows</span>
				<span class="badge badge-neutral">{parsed.metricScores.length} metric scores</span>
				{#if parsed.warnings.length}
					<button
						class="badge badge-warning cursor-pointer"
						onclick={() => (showWarns = !showWarns)}
					>
						⚠ {parsed.warnings.length} warning{parsed.warnings.length > 1 ? 's' : ''} — {showWarns
							? 'hide'
							: 'show'}
					</button>
				{/if}
			</div>

			<!-- Warnings -->
			{#if showWarns && parsed.warnings.length}
				<div class="bg-warning/10 rounded-lg p-3">
					<ul class="space-y-1">
						{#each parsed.warnings as w (w)}
							<li class="text-warning-content text-xs">{w}</li>
						{/each}
					</ul>
				</div>
			{/if}

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
