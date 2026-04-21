<script lang="ts">
	import { resolve } from '$app/paths';
	import { tidy, filter, arrange, desc } from '@tidyjs/tidy';
	import NavButton from '$lib/components/ui/NavButton.svelte';
	import DataTable from '$lib/components/ui/DataTable.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import { validatorStore } from '$lib/stores/validatorStore.svelte';
	import type { ValidationResult, MissingnessEntry } from '$lib/engine/validator';
	import NoDataState from '$lib/components/ui/NoDataState.svelte';

	const result = $derived(validatorStore.validationResult as unknown as ValidationResult | null);
	const header = $derived(validatorStore.lastHeader ?? []);
	const rows = $derived(validatorStore.lastRows ?? []);

	const numDataRows = $derived(Array.isArray(rows) ? rows.length : 0);
	const numCols = $derived(Array.isArray(header) ? header.length : 0);

	const missingnessRows = $derived(
		tidy(
			(result?.missingnessMap ?? []) as MissingnessEntry[],
			filter((d) => d.missing > 0),
			arrange(desc('missing'))
		) as unknown as Record<string, unknown>[]
	);

	const previewRows = $derived(
		Array.isArray(rows)
			? (rows as unknown as unknown[][])
					.slice(0, 10)
					.map((row) =>
						Object.fromEntries(header.map((col: string, i: number) => [col, row[i] ?? '']))
					)
			: []
	);
</script>

<svelte:head>
	<title>ANA | Validation details</title>
</svelte:head>

<div class="mx-auto max-w-5xl px-4">
	{#if result}
		<div class="mb-6 flex justify-between gap-4">
			<div class="flex items-baseline gap-2">
				<h1 class="text-2xl font-semibold">Validation details</h1>
				{#if validatorStore.filename}
					<span class="text-base-content/75">{validatorStore.filename}</span>
				{/if}
			</div>
			<NavButton href={resolve('/')} label="Go home" direction="back" size="md" />
		</div>
		<div class="card w-full">
			<div class="card-body flex flex-col gap-4">
				<!-- Summary -->
				<Card>
					<div class="flex flex-wrap items-center gap-2">
						{#if result.ok}
							<span class="badge badge-success">Validation passed</span>
						{:else}
							<span class="badge badge-error">Validation failed</span>
						{/if}
						<span>
							{numDataRows} row(s) × {numCols} column(s)
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
				</Card>

				<!-- Header errors -->
				{#if result.headerErrors?.length}
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
				{#if result.duplicateUoas?.length}
					<div>
						<p class="text-error mb-1 font-semibold">Duplicate UoA values</p>
						<ul class="list-inside list-disc space-y-0.5 text-sm">
							{#each result.duplicateUoas as d, i (i)}
								<li>
									<strong>{d.uoa}</strong> — rows: {Array.isArray(d.rows)
										? d.rows.join(', ')
										: d.rows}
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				<!-- Cell errors -->
				{#if result.cellErrors?.length}
					<DataTable
						rows={result.cellErrors as unknown as Record<string, unknown>[]}
						headerRowClass="bg-error/20 text-error text-xs"
						overflow="paginate"
						pageSize={10}
						downloadable
						downloadFilename="cell-errors"
						title="Cell errors ({result.cellErrors.length})"
						titleClass="text-error font-semibold"
					/>
				{/if}

				<!-- Missingness -->
				{#if missingnessRows.length > 0}
					<DataTable
						rows={missingnessRows}
						headerRowClass="bg-warning/20 text-warning text-xs"
						overflow="paginate"
						pageSize={10}
						downloadable
						downloadFilename="missingness"
						title="Missingness by metric"
						titleClass="text-warning font-semibold"
					/>
				{/if}

				<!-- Warnings -->
				{#if result.warnings?.length}
					<div>
						<p class="text-warning mb-2 text-lg font-semibold">
							Warnings ({result.warnings.length})
						</p>
						<ul class="list-inside list-disc space-y-0.5 text-sm">
							{#each result.warnings as w, i (i)}
								<li>{w}</li>
							{/each}
						</ul>
					</div>
				{/if}

				<!-- CSV preview -->
				{#if header.length}
					<DataTable
						rows={previewRows}
						headerRowClass="text-primary bg-primary/2  text-xs"
						overflow="paginate"
						pageSize={10}
						title="CSV preview"
						titleClass="text-primary font-semibold"
					/>
				{/if}
			</div>
		</div>
	{:else}
		<NoDataState
			title="No validation results"
			subtitle="Either data was validated or there was no data. Upload and validate a (new) CSV file on the Home page."
		></NoDataState>
	{/if}
</div>
