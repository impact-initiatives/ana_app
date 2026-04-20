<script lang="ts">
	import DataTable from '$lib/components/ui/DataTable.svelte';
	import { tidy, filter, arrange, desc } from '@tidyjs/tidy';

	let { result = null, header = [], rows = [], loading = false } = $props();

	const numDataRows = () => (rows && Array.isArray(rows) ? rows.length : 0);
	const numCols = () => (header && Array.isArray(header) ? header.length : 0);

	const formatCell = (v: unknown) => (v === null || v === undefined ? '' : String(v));

	// --- missingness table rows ---
	const missingnessRows = $derived(
		tidy(
			(result?.missingnessMap ?? []) as import('$lib/engine/validator').MissingnessEntry[],
			filter((d) => d.missing > 0),
			arrange(desc('missing'))
		) as unknown as Record<string, unknown>[]
	);

	// --- preview table rows ---
	const previewRows = $derived(
		rows && Array.isArray(rows)
			? rows
					.slice(0, 10)
					.map((row: unknown[]) =>
						Object.fromEntries(header.map((col: string, i: number) => [col, formatCell(row[i])]))
					)
			: []
	);
</script>

<div class="flex flex-col gap-4">
	{#if loading}
		<div class="card flex items-center gap-3 p-4">
			<span class="loading loading-spinner loading-md text-primary"></span>
			<span class="text-base-content/60">Being processed…</span>
		</div>
	{:else}
		<!-- Summary card -->
		<div class="card border p-4">
			{#if result}
				<div class="flex flex-wrap items-center gap-2">
					{#if result.ok}
						<span class="badge badge-success">Validation passed</span>
					{:else}
						<span class="badge badge-error">Validation failed</span>
					{/if}
					<span class="text-base-content/75 text-sm">
						{numDataRows()} row(s) × {numCols()} column(s)
					</span>
					{#if result.headerErrors?.length}
						<span class="badge badge-error badge-outline"
							>{result.headerErrors.length} header error(s)</span
						>
					{/if}
					{#if result.cellErrors?.length}
						<span class="badge badge-error badge-outline"
							>{result.cellErrors.length} cell error(s)</span
						>
					{/if}
					{#if result.warnings?.length}
						<span class="badge badge-warning badge-outline"
							>{result.warnings.length} warning(s)</span
						>
					{/if}
				</div>
			{:else}
				<span class="text-base-content/80 text-sm">No validation run yet</span>
			{/if}
		</div>

		<!-- Header errors -->
		{#if result?.headerErrors?.length}
			<div>
				<p class="text-error mb-1 font-semibold">Header errors</p>
				<ul class="list-inside list-disc space-y-0.5 text-sm">
					{#each result.headerErrors as he, i (i)}
						<li>{he}</li>
					{/each}
				</ul>
			</div>
		{/if}

		<!-- Duplicate UOAs -->
		{#if result?.duplicateUoas?.length}
			<div>
				<p class="text-error mb-1 font-semibold">Duplicate UoA values</p>
				<ul class="list-inside list-disc space-y-0.5 text-sm">
					{#each result.duplicateUoas as d, i (i)}
						<li>
							<strong>{d.uoa}</strong> — rows: {Array.isArray(d.rows) ? d.rows.join(', ') : d.rows}
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		<!-- Cell errors table -->
		{#if result?.cellErrors?.length}
			<div>
				<p class="text-error mt-2 mb-2 font-semibold">Cell errors ({result.cellErrors.length})</p>
				<DataTable
					rows={result.cellErrors}
					headerRowClass="bg-error/20 text-error"
					overflow="paginate"
					pageSize={10}
				/>
			</div>
		{/if}

		<!-- Missingness table -->
		{#if missingnessRows.length > 0}
			<div>
				<p class="text-warning mt-2 mb-2 font-semibold">Missingness by indicator</p>
				<DataTable
					rows={missingnessRows}
					headerRowClass="bg-warning/20 text-warning"
					overflow="paginate"
					pageSize={10}
				/>
			</div>
		{/if}

		<!-- Warnings -->
		{#if result?.warnings?.length}
			<div>
				<p class="text-warning mt-2 mb-2 font-semibold">Warnings ({result.warnings.length})</p>
				<ul class="list-inside list-disc space-y-0.5 text-sm">
					{#each result.warnings as w, i (i)}
						<li>{w}</li>
					{/each}
				</ul>
			</div>
		{/if}

		<!-- CSV preview -->
		<div>
			{#if header?.length}
				<p class="text-primary mt-2 mb-2 font-semibold">
					CSV preview: first {Math.min(10, numDataRows())} row(s)
				</p>
				<DataTable rows={previewRows} headerRowClass="bg-primary/20 text-primary" />
			{/if}
		</div>
	{/if}
</div>
