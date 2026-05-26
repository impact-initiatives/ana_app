<script lang="ts">
	import { resolve } from '$app/paths';
	import { tidy, filter, arrange, desc } from '@tidyjs/tidy';
	import NavButton from '$lib/components/ui/NavButton.svelte';
	import DataTable from '$lib/components/ui/DataTable.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import CheckCircleIcon from '$lib/components/ui/CheckCircleIcon.svelte';
	import ExclamationCircleIcon from '$lib/components/ui/ExclamationCircleIcon.svelte';
	import { validatorStore } from '$lib/stores/validatorStore.svelte';
	import type { ValidationResult, MissingnessEntry } from '$lib/engine/dataValidator';
	import NoDataState from '$lib/components/ui/NoDataState.svelte';

	const result = $derived(validatorStore.validationResult as unknown as ValidationResult | null);
	const header = $derived(validatorStore.lastHeader ?? []);
	const rows = $derived(validatorStore.lastRows ?? []);

	const numDataRows = $derived(Array.isArray(rows) ? rows.length : 0);
	const numCols = $derived(Array.isArray(header) ? header.length : 0);
	const errCount = $derived(result?.cellErrors?.length ?? 0);
	const warnCount = $derived(result?.warnings?.length ?? 0);

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

<div class="mx-auto max-w-5xl px-4 pb-10">
	{#if result}
		<PageHeader title="Validation results" subtitle={validatorStore.filename ?? undefined}>
			{#snippet action()}
				<NavButton href={resolve('/')} label="Go home" direction="back" size="sm" />
			{/snippet}
		</PageHeader>

		<div class="flex flex-col gap-4">
			<!-- Status banner -->
			<div role="alert" class="alert {result.ok ? 'alert-success' : 'alert-error'}">
				{#if result.ok}
					<CheckCircleIcon size="size-6" />
				{:else}
					<ExclamationCircleIcon size="size-6" />
				{/if}
				<span class="font-semibold">{result.ok ? 'Validation passed' : 'Validation failed'}</span>
				<span class="ml-auto text-sm">{numDataRows} rows × {numCols} columns</span>
			</div>

			<!-- Stats -->
			<div class="stats stats-vertical lg:stats-horizontal w-full shadow">
				<div class="stat bg-base-100 border-base-300 border shadow-sm">
					<div class="stat-title">Rows</div>
					<div class="stat-value text-3xl">{numDataRows}</div>
					<div class="stat-desc">units of analysis</div>
				</div>
				<div class="stat bg-base-100 border-base-300 border shadow-sm">
					<div class="stat-title">Columns</div>
					<div class="stat-value text-3xl">{numCols}</div>
					<div class="stat-desc">variables</div>
				</div>
				<div class="stat bg-base-100 border-base-300 border shadow-sm">
					<div class="stat-figure text-error">
						<ExclamationCircleIcon size="size-8" />
					</div>
					<div class="stat-title">Cell errors</div>
					<div class="stat-value text-error text-3xl">{errCount}</div>
					<div class="stat-desc">{errCount > 0 ? 'need fixing' : 'all clear'}</div>
				</div>
				<div class="stat bg-base-100 border-base-300 border shadow-sm">
					<div class="stat-figure text-warning">
						<ExclamationCircleIcon size="size-8" />
					</div>
					<div class="stat-title">Warnings</div>
					<div class="stat-value text-warning text-3xl">{warnCount}</div>
					<div class="stat-desc">{warnCount > 0 ? 'review recommended' : 'no warnings'}</div>
				</div>
			</div>

			<!-- Header errors -->
			{#if result.headerErrors?.length}
				<Card class="border-error border-l-4">
					<div class="mb-2 flex items-center gap-2">
						<ExclamationCircleIcon size="size-4" class="text-error shrink-0" />
						<span class="text-error font-semibold"
							>Header errors ({result.headerErrors.length})</span
						>
					</div>
					<ul class="list-inside list-disc space-y-1 text-sm">
						{#each result.headerErrors as he, i (i)}
							<li>{he}</li>
						{/each}
					</ul>
				</Card>
			{/if}

			<!-- Duplicate UoAs -->
			{#if result.duplicateUoas?.length}
				<Card class="border-error border-l-4">
					<div class="mb-2 flex items-center gap-2">
						<ExclamationCircleIcon size="size-4" class="text-error shrink-0" />
						<span class="text-error font-semibold"
							>Duplicate UoA values ({result.duplicateUoas.length})</span
						>
					</div>
					<ul class="list-inside list-disc space-y-1 text-sm">
						{#each result.duplicateUoas as d, i (i)}
							<li>
								<strong>{d.uoa}</strong> — rows:
								{Array.isArray(d.rows) ? d.rows.join(', ') : d.rows}
							</li>
						{/each}
					</ul>
				</Card>
			{/if}

			<!-- Cell errors -->
			{#if result.cellErrors?.length}
				<DataTable
					rows={result.cellErrors as unknown as Record<string, unknown>[]}
					overflow="paginate"
					pageSize={10}
					columnSearchable
					downloadable
					downloadFilename="cell-errors"
					title="Cell errors ({result.cellErrors.length})"
					titleClass="text-error font-semibold"
					humanizeHeaders
				/>
			{/if}

			<!-- Missingness -->
			{#if missingnessRows.length > 0}
				<DataTable
					rows={missingnessRows}
					overflow="paginate"
					pageSize={10}
					downloadable
					downloadFilename="missingness"
					title="Missingness by metric"
					titleClass="text-warning font-semibold"
					humanizeHeaders
				/>
			{/if}

			<!-- Warnings -->
			{#if result.warnings?.length}
				<Card class="border-warning border-l-4">
					<div class="mb-2 flex items-center gap-2">
						<ExclamationCircleIcon size="size-4" class="text-warning shrink-0" />
						<span class="text-warning font-semibold">Warnings ({result.warnings.length})</span>
					</div>
					<ul class="space-y-2 text-sm">
						{#each result.warnings as w, i (i)}
							<li class="flex items-start gap-2">
								<ExclamationCircleIcon size="size-4" class="text-warning mt-0.5 shrink-0" />
								<span>{w}</span>
							</li>
						{/each}
					</ul>
				</Card>
			{/if}

			<!-- CSV preview -->
			{#if header.length}
				<DataTable
					rows={previewRows}
					overflow="paginate"
					pageSize={10}
					title="CSV preview — first 10 rows"
					titleClass="font-semibold"
				/>
			{/if}
		</div>
	{:else}
		<NoDataState
			title="No validation results"
			subtitle="Upload and validate a CSV file on the Home page to see results here."
		/>
	{/if}
</div>
