<script lang="ts">
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { resolve, asset } from '$app/paths';
	import { revealOnScroll } from '$lib/utils/revealOnScroll.svelte';
	import { steps } from '$lib/types/steps';
	import CsvUploader from '$lib/components/data/CsvUploader.svelte';
	import NavButton from '$lib/components/ui/NavButton.svelte';
	import { loadMetrics, metricStore } from '$lib/stores/metricStore.svelte';
	import { flagStore, clearFlagResult } from '$lib/stores/flagStore.svelte';
	import {
		validatorStore,
		saveValidatorState,
		clearValidatorState
	} from '$lib/stores/validatorStore.svelte';
	import { adminFeaturesStore, clearAdminFeatures } from '$lib/stores/adminFeaturesStore.svelte';
	import { validateCsv, type ValidationResult } from '$lib/engine/validator';
	import { runPipeline } from '$lib/engine/pipeline';
	import Card from '$lib/components/ui/Card.svelte';
	import { FLAG_BADGE_MAP, getFlagBadge } from '$lib/utils/colors';

	interface ParseError {
		message: string;
	}

	let lastHeader: string[] = $state([]);
	let lastRows: Record<string, unknown>[] = $state([]);
	let validationResult: ValidationResult | null = $state(null);
	let parseErrors: ParseError[] | ParseError | null = $state(null);
	let filename: string | null = $state(null);
	let isValidating = $state(false);
	let pipelineError = $state<string | null>(null);
	let validationPassed = $state(false);
	let formatModal = $state<HTMLDialogElement | null>(null);
	let stepsModal = $state<HTMLDialogElement | null>(null);
	let activeStep = $state(0);
	let mounted = $state(false);

	const metricMap = $derived(metricStore.metricMap);
	const flagKeys = Object.keys(FLAG_BADGE_MAP);

	const hasPreviousResults = $derived(
		flagStore.flaggedResult !== null &&
			flagStore.flaggedResult.length > 0 &&
			!validatorStore.validationResult
	);

	function openStep(i: number) {
		activeStep = i;
		stepsModal?.showModal();
	}

	onMount(() => {
		loadMetrics();
		lastHeader = validatorStore.lastHeader ?? [];
		lastRows = validatorStore.lastRows ?? [];
		validationResult = (validatorStore.validationResult as ValidationResult | null) ?? null;
		parseErrors = (validatorStore.parseErrors as ParseError[] | ParseError | null) ?? null;
		filename = validatorStore.filename ?? null;
		mounted = true;
	});

	function onParsed(detail: {
		errors?: unknown[];
		header?: string[];
		rows?: unknown[];
		fileName?: string;
	}) {
		parseErrors = detail.errors?.length ? (detail.errors as ParseError[]) : null;
		lastHeader = detail.header ?? [];
		lastRows = (detail.rows ?? []) as Record<string, unknown>[];
		filename = detail.fileName ?? null;
		validationPassed = false;

		clearFlagResult();
		if (adminFeaturesStore.fetchState === 'error') clearAdminFeatures();

		isValidating = true;
		pipelineError = null;

		// Defer to the next tick so the spinner renders before the synchronous
		// validateCsv work blocks the main thread.
		setTimeout(async () => {
			validationResult = validateCsv(lastHeader, lastRows as unknown as unknown[][], metricMap);
			isValidating = false;
			saveValidatorState(
				lastHeader,
				lastRows,
				validationResult as unknown as Record<string, unknown> | null,
				parseErrors,
				filename
			);
			if (validationResult?.ok && validationResult.numericObjects?.length) {
				try {
					await runPipeline({
						header: lastHeader,
						rows: lastRows,
						filename,
						metricMap,
						referenceJson: metricStore.referenceJson
					});
				} catch (e) {
					pipelineError = e instanceof Error ? e.message : String(e);
				}
				validationPassed = true;
			}
		}, 0);
	}

	function onParseError(detail: { message: string; errors?: unknown[] }) {
		parseErrors = detail ?? { message: 'Unknown parse error' };
		validationResult = null;
		lastHeader = [];
		lastRows = [];
		filename = null;
	}

	function clearAll() {
		validationResult = null;
		lastHeader = [];
		lastRows = [];
		parseErrors = null;
		filename = null;
		pipelineError = null;
		validationPassed = false;
		clearValidatorState();
		clearFlagResult();
		clearAdminFeatures();
	}
</script>

<svelte:head>
	<title>ANA | Acute Needs Analysis</title>
</svelte:head>

<div class="mx-auto max-w-5xl px-4">
	<!-- ── Hero ────────────────────────────────────────────────────────────────── -->
	<section
		aria-label="Introduction"
		class="mx-auto flex min-h-[calc(100svh-3.5rem)] max-w-6xl flex-col justify-center pt-4 pb-24 lg:pt-0 lg:pb-32"
	>
		<div class="flex flex-col items-center gap-10 lg:flex-row lg:items-center lg:gap-16">
			<!-- Left: text + CTA -->
			{#if mounted}
				<div class="flex-1 text-center lg:text-left">
					<div
						class="mb-4 flex flex-wrap items-center justify-center gap-2 lg:justify-start"
						in:fly={{ y: 16, duration: 400, delay: 0, easing: cubicOut, opacity: 0 }}
					>
						<span
							class="border-primary/20 bg-primary/8 text-primary inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold"
						>
							<span class="bg-primary inline-block size-1.5 rounded-full"></span>
							198 metrics · 8 humanitarian systems
						</span>
						{#if hasPreviousResults && !validationPassed}
							<a
								href={resolve('/results')}
								class="border-success/30 bg-success/10 text-success hover:bg-success/20 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-150"
							>
								<span class="bg-success inline-block size-1.5 rounded-full"></span>
								Continue with previous results
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="size-3"
									viewBox="0 0 20 20"
									fill="currentColor"
									aria-hidden="true"
									><path
										fill-rule="evenodd"
										d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
										clip-rule="evenodd"
									/></svg
								>
							</a>
							<button
								class="border-error/30 bg-error/10 text-error hover:bg-error/20 inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-150"
								onclick={clearAll}
								><span class="bg-error inline-block size-1.5 rounded-full"></span>
								Clear
							</button>
						{/if}
					</div>
					<h1
						class="mb-4 text-4xl leading-tight font-bold sm:text-5xl lg:text-6xl"
						in:fly={{ y: 20, duration: 500, delay: 80, easing: cubicOut, opacity: 0 }}
					>
						Screen humanitarian data for<br class="hidden sm:block" />
						<span class="text-primary"> Risk of Excess Mortality</span>
					</h1>
					<p
						class="text-base-content/80 mx-auto mt-4 max-w-lg text-lg leading-relaxed lg:mx-0"
						in:fly={{ y: 20, duration: 500, delay: 180, easing: cubicOut, opacity: 0 }}
					>
						Validate, flag, and visualize all units of analysis against reference thresholds —
						automatically. Upload your data and ANA does the rest.
					</p>
					<div
						class="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start"
						in:fly={{ y: 16, duration: 450, delay: 280, easing: cubicOut, opacity: 0 }}
					>
						<a
							href="#upload"
							class="btn btn-primary cursor-pointer shadow-sm transition-shadow hover:shadow-md"
						>
							Get started
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="size-4"
								viewBox="0 0 20 20"
								fill="currentColor"
								aria-hidden="true"
							>
								<path
									fill-rule="evenodd"
									d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z"
									clip-rule="evenodd"
								/>
							</svg>
						</a>
						<a href="#how-it-works" class="btn btn-outline cursor-pointer"> How it works </a>
					</div>
				</div>
			{/if}

			<!-- Right: live mini-mockup -->
			{#if mounted}
				<div
					class="w-full max-w-sm shrink-0 lg:w-auto"
					in:fly={{ x: 32, y: 16, duration: 600, delay: 200, easing: cubicOut, opacity: 0 }}
				>
					<div class="card bg-base-100 border-base-300 border shadow-lg">
						<div class="card-body gap-4 p-5">
							<!-- Mini header -->
							<div class="flex items-center justify-between">
								<span class="text-base-content/85 text-xs font-semibold tracking-wide uppercase"
									>Preliminary flagging</span
								>
								<span
									class=" border-success/30 bg-success/10 text-success inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold"
									>Processed</span
								>
							</div>

							<!-- Mini heatmap grid -->
							<div class="grid grid-cols-8 gap-1" aria-hidden="true">
								{#each ['flag', 'no_flag', 'no_flag', 'flag', 'no_flag', 'no_data', 'no_flag', 'no_flag', 'no_flag', 'flag', 'no_flag', 'no_flag', 'insuff', 'no_flag', 'flag', 'no_flag', 'no_data', 'no_flag', 'flag', 'no_flag', 'no_flag', 'no_flag', 'no_flag', 'flag', 'no_flag', 'no_flag', 'no_flag', 'insuff', 'no_flag', 'flag', 'no_flag', 'no_flag'] as cell, idx (idx)}
									<div
										class="cell aspect-square rounded-sm"
										style:background-color={cell === 'flag'
											? 'var(--color-flag-tint)'
											: cell === 'no_flag'
												? 'var(--color-no-flag-tint)'
												: cell === 'insuff'
													? 'var(--color-insufficient-tint)'
													: 'var(--color-no-data-tint)'}
										style:--i={idx}
									></div>
								{/each}
							</div>

							<!-- Legend badges -->

							<div class="flex flex-wrap gap-1.5">
								{#each flagKeys as key (key)}
									<span class="badge badge-sm" style={getFlagBadge(key).badgeStyle}>
										{getFlagBadge(key).label}
									</span>
								{/each}
							</div>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</section>

	<!-- ── Upload card ────────────────────────────────────────────────────────── -->
	<div
		id="upload"
		class="mx-auto mt-4 max-w-lg scroll-mt-20"
		style="opacity: 0"
		{@attach revealOnScroll({ y: 28, duration: 500 })}
	>
		<Card title="Get started" subtitle="Upload a CSV file with your data.">
			{#snippet titleActions()}
				<button
					class="btn btn-sm btn-primary btn-outline shrink-0 cursor-pointer gap-1"
					onclick={() => formatModal?.showModal()}
					title="CSV format reference"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="size-3.5"
						viewBox="0 0 20 20"
						fill="currentColor"
						aria-hidden="true"
					>
						<path
							fill-rule="evenodd"
							d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
							clip-rule="evenodd"
						/>
					</svg>
					Format
				</button>
			{/snippet}

			<div class="mt-4">
				<CsvUploader onparsed={onParsed} onerror={onParseError} oncleared={clearAll} />
			</div>

			<!-- Parse / pipeline errors -->
			{#if parseErrors}
				<div class="bg-error/8 border-error/15 mt-4 rounded-lg border px-4 py-3">
					<p class="text-error text-sm font-semibold">Parsing errors</p>
					<ul class="text-error mt-1 list-disc pl-5 text-sm">
						{#if Array.isArray(parseErrors)}
							{#each parseErrors as pe (JSON.stringify(pe))}
								<li>{pe.message ?? JSON.stringify(pe)}</li>
							{/each}
						{:else}
							<li>{parseErrors.message ?? JSON.stringify(parseErrors)}</li>
						{/if}
					</ul>
				</div>
			{/if}
			{#if pipelineError}
				<div class="bg-error/8 border-error/15 mt-4 rounded-lg border px-4 py-3">
					<p class="text-error text-sm font-semibold">Processing error</p>
					<p class="text-error mt-0.5 text-sm">{pipelineError}</p>
				</div>
			{/if}

			<!-- Compact validation status -->
			{#if isValidating}
				<div class="mt-4 flex items-center gap-2.5">
					<span class="loading loading-spinner loading-xs text-primary"></span>
					<span class="text-base-content/75 text-sm">Validating…</span>
				</div>
			{:else if validationResult && !validationResult.ok}
				<div
					class="border-error/20 bg-error/6 mt-4 flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
				>
					<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
						<span class="badge badge-error badge-sm">Validation failed</span>
						<span class="text-base-content/85 text-xs">
							{#if validationResult.headerErrors?.length}
								{validationResult.headerErrors.length} header error{validationResult.headerErrors
									.length !== 1
									? 's'
									: ''}
								{#if validationResult.cellErrors?.length || validationResult.warnings?.length}·{/if}
							{/if}
							{#if validationResult.cellErrors?.length}
								{validationResult.cellErrors.length} cell error{validationResult.cellErrors
									.length !== 1
									? 's'
									: ''}
								{#if validationResult.warnings?.length}·{/if}
							{/if}
							{#if validationResult.warnings?.length}
								{validationResult.warnings.length} warning{validationResult.warnings.length !== 1
									? 's'
									: ''}
							{/if}
						</span>
					</div>
					<a
						href={resolve('/validate')}
						class="btn btn-error btn-outline btn-xs shrink-0 cursor-pointer gap-1"
					>
						View details
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="size-3"
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
					</a>
				</div>
			{:else if validationResult?.ok}
				<div class="mt-4 flex items-center gap-2.5">
					<span class="badge badge-success badge-sm">Validation passed</span>
					<span class="text-base-content/70 text-xs">
						{validationResult.numericObjects?.length ?? 0} rows · {lastHeader.length} columns
					</span>
				</div>
			{/if}
		</Card>

		<!-- Post-processing CTA -->
		{#if validationPassed}
			<div
				class="border-primary/20 bg-primary/5 mt-3 flex items-center justify-between gap-4 rounded-lg border px-4 py-3"
			>
				<p class="text-base-content/90 text-xs">Data processed — ready to explore.</p>
				<div>
					<NavButton
						href={resolve('/results')}
						label="View Results"
						direction="forward"
						variant="primary"
						size="sm"
					/>
					<NavButton
						href={resolve('/results#export')}
						label="Export"
						direction="forward"
						variant="outline"
						size="sm"
					/>
				</div>
			</div>
		{/if}
	</div>

	<!-- ── How it works ───────────────────────────────────────────────────────── -->
	<section id="how-it-works" aria-labelledby="how-it-works-heading" class="mt-16">
		<h2
			id="how-it-works-heading"
			class="mb-8 text-center text-lg font-semibold tracking-widest uppercase"
			style="opacity: 0"
			{@attach revealOnScroll({ y: 16, duration: 400 })}
		>
			How it works
		</h2>
		<div class="grid grid-cols-1 gap-6 sm:grid-cols-3">
			{#each steps as step, i (i)}
				{#if mounted}
					<button
						class="card bg-base-100 border-base-300 hover:border-primary/40 group focus-visible:ring-primary relative cursor-pointer overflow-hidden border shadow-sm transition-all duration-200 hover:shadow-md focus-visible:ring-2 focus-visible:outline-none"
						onclick={() => openStep(i)}
						{@attach revealOnScroll({ y: 28, duration: 480, delay: 80 * i })}
					>
						<!-- Background step number -->
						<span
							class="text-base-content/5 pointer-events-none absolute top-2 right-3 text-8xl leading-none font-bold select-none"
							aria-hidden="true"
						>
							{String(i + 1).padStart(2, '0')}
						</span>

						<div class="card-body relative text-left">
							<!-- Icon -->
							<div
								class="bg-primary/10 text-primary group-hover:bg-primary/15 flex size-11 items-center justify-center rounded-xl transition-colors duration-200"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="size-5"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.75"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									{#if i === 0}
										<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
										<polyline points="17 8 12 3 7 8" />
										<line x1="12" y1="3" x2="12" y2="15" />
									{:else if i === 1}
										<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
										<line x1="4" y1="22" x2="4" y2="15" />
									{:else}
										<line x1="18" y1="20" x2="18" y2="10" />
										<line x1="12" y1="20" x2="12" y2="4" />
										<line x1="6" y1="20" x2="6" y2="14" />
									{/if}
								</svg>
							</div>

							<h3 class="mt-3 text-lg font-semibold">{step.title}</h3>
							<p class="text-base-content/80 mt-1 text-sm leading-relaxed">{step.desc}</p>
							<p
								class="text-base-content/75 group-hover:text-primary mt-4 flex items-center gap-1 text-xs transition-colors duration-150"
							>
								Details
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="size-3 transition-transform duration-150 group-hover:translate-x-0.5"
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
							</p>
						</div>
					</button>
				{/if}
			{/each}
		</div>
	</section>

	<!-- ── Caveat note ────────────────────────────────────────────────────────── -->
	<div
		role="alert"
		class="alert alert-info alert-soft mt-6 mb-6"
		style="opacity: 0"
		{@attach revealOnScroll({ y: 16, duration: 400, delay: 100 })}
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			class="h-6 w-6 shrink-0 stroke-current"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
			></path>
		</svg>
		<p>
			The preliminary flag is a data-driven pre-screening result, not a conclusion. Each unit of
			analysis requires a full deep-dive before drawing final conclusions.
		</p>
	</div>

	<!-- ── Modals ──────────────────────────────────────────────────────────────── -->

	<!-- Format guide: CSV structure only -->
	<dialog bind:this={formatModal} class="modal">
		<div class="modal-box max-w-lg">
			<form method="dialog">
				<button
					class="btn btn-xs btn-circle btn-ghost btn-outline absolute top-3 right-3 cursor-pointer"
					aria-label="Close">✕</button
				>
			</form>
			<h3 class="text-lg font-bold">CSV format guide</h3>
			<p class="text-base-content/85 text-md mt-1">How to structure your file before uploading.</p>

			<div
				class="border-primary/20 bg-primary/6 mt-5 flex items-center gap-2.5 rounded-lg border px-4 py-3"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-primary size-4 shrink-0"
					viewBox="0 0 20 20"
					fill="currentColor"
					aria-hidden="true"
				>
					<path
						fill-rule="evenodd"
						d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
						clip-rule="evenodd"
					/>
				</svg>
				<p class="text-sm">
					Download the CSV
					<a
						href={asset('/data/input_template.csv')}
						class="text-primary font-semibold underline underline-offset-2">template</a
					>. And read the below for information on how to fill in.
				</p>
			</div>

			<div class="text-base-content/85 mt-5 space-y-3 text-sm">
				<div class="border-base-300 bg-base-200/40 rounded-lg border px-4 py-3.5">
					<div class="flex items-center justify-between gap-2">
						<p class="text-base-content font-semibold">uoa column</p>
						<span class="badge badge-error badge-sm">required</span>
					</div>
					<p class="mt-1">
						A column named exactly <code>uoa</code> which is a unique identifier for rows such as p-code,
						district name, or any string that identifies the unit of analysis (UoA).
					</p>
					<p class="mt-1">
						If <code>uoa</code> values are valid admin p-codes (e.g. <code>SOM001</code>), a
						choropleth map is generated automatically.
					</p>
				</div>
				<div class="border-base-300 bg-base-200/40 rounded-lg border px-4 py-3.5">
					<div class="flex items-center justify-between gap-2">
						<p class="text-base-content font-semibold">Metric columns</p>
						<span class="badge badge-error badge-sm">required</span>
					</div>
					<p class="mt-1">
						Named with the metric ID (e.g. <code>MET001</code>, <code>MET002</code>). Unrecognised
						column names are silently ignored during flagging.
					</p>
				</div>
				<div class="border-base-300 bg-base-200/40 rounded-lg border px-4 py-3.5">
					<div class="flex items-center justify-between gap-2">
						<p class="text-base-content font-semibold">Metadata columns</p>
						<span class="badge badge-primary badge-sm">optional</span>
					</div>
					<p class="mt-1">
						Extra columns (e.g. <code>region</code>, <code>partner</code>) are carried through and
						available as filters in results views.
					</p>
				</div>
				<div class="border-base-300 bg-base-200/40 rounded-lg border px-4 py-3.5">
					<div class="flex items-center justify-between gap-2">
						<p class="text-base-content font-semibold">Values</p>
						<span class="badge badge-primary badge-sm">info</span>
					</div>
					<p class="mt-1">
						Must be generally numeric or empty. No formatted strings, units, or special characters.
						For missing values, leave the cell empty instead of writing "N/A" or "missing". See the
						Reference tab for type constraints — for example, proportions must be between 0 and 1.
					</p>
				</div>
			</div>

			<div
				class="border-primary/20 bg-primary/6 mt-5 flex items-center gap-2.5 rounded-lg border px-4 py-3"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-primary size-4 shrink-0"
					viewBox="0 0 20 20"
					fill="currentColor"
					aria-hidden="true"
				>
					<path
						fill-rule="evenodd"
						d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
						clip-rule="evenodd"
					/>
				</svg>
				<p class="text-sm">
					For the full list of metrics and their type constraints, check out the
					<a
						href={resolve('/reference')}
						class="text-primary font-semibold underline underline-offset-2">Reference</a
					> tab.
				</p>
			</div>
		</div>
		<form method="dialog" class="modal-backdrop"><button>close</button></form>
	</dialog>

	<!-- Step detail modal (shared, switches content via activeStep) -->
	<dialog bind:this={stepsModal} class="modal">
		<div class="modal-box max-w-lg">
			<form method="dialog">
				<button
					class="btn btn-xs btn-circle btn-ghost btn-outline absolute top-3 right-3 cursor-pointer"
					aria-label="Close">✕</button
				>
			</form>

			<!-- Step nav pills -->
			<div class="mb-5 flex flex-wrap gap-2">
				{#each steps as step, i (i)}
					<button
						class={[
							'cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-150',
							activeStep === i
								? 'bg-primary text-primary-content'
								: 'bg-base-200 text-base-content/85 hover:text-base-content'
						].join(' ')}
						onclick={() => (activeStep = i)}
					>
						{i + 1}. {step.title}
					</button>
				{/each}
			</div>

			<h3 class="font-semibold">{steps[activeStep].title}</h3>
			<p class="text-base-content/85 mt-1 text-sm">{steps[activeStep].desc}</p>

			<div class="text-base-content mt-5 space-y-3 text-sm">
				{#each steps[activeStep].detail.sections as section (section.label)}
					{#if section.route}
						<a
							href={resolve(section.route)}
							class="border-base-300 hover:bg-base-200 bg-base-200/40 block rounded-lg border px-4 py-3.5"
						>
							<p class="font-semibold">{section.label}</p>
							<p class="text-base-content/85 mt-1">{section.body}</p>
						</a>
					{:else}
						<div class="border-base-300 bg-base-200/40 rounded-lg border px-4 py-3.5">
							<p class="font-semibold">{section.label}</p>
							<p class="text-base-content/85 mt-1">{section.body}</p>
						</div>
					{/if}
				{/each}
			</div>

			{#if steps[activeStep].detail.tip}
				<div
					class="border-primary/20 bg-primary/6 mt-4 flex items-center gap-2.5 rounded-lg border px-4 py-3"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-primary size-4 shrink-0"
						viewBox="0 0 20 20"
						fill="currentColor"
						aria-hidden="true"
					>
						<path
							fill-rule="evenodd"
							d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
							clip-rule="evenodd"
						/>
					</svg>
					<p class="text-xs">
						{steps[activeStep].detail.tip}
						{#if activeStep === 0}
							<a
								href={resolve('/reference')}
								class="text-primary font-semibold underline underline-offset-2">Reference</a
							> tab.
						{/if}
					</p>
				</div>
			{/if}
		</div>
		<form method="dialog" class="modal-backdrop"><button>close</button></form>
	</dialog>
</div>

<!-- /max-w-5xl -->

<style>
	:global(html) {
		scroll-behavior: smooth;
	}

	/* Staggered fade-in for mini heatmap cells */
	.cell {
		animation: cellFadeIn 300ms ease-out both;
		animation-delay: calc(var(--i, 0) * 35ms + 400ms);
	}

	@keyframes cellFadeIn {
		from {
			opacity: 0;
			transform: scale(0.6);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.cell {
			animation: none;
		}
	}
</style>
