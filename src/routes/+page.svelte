<script lang="ts">
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { resolve } from '$app/paths';
	import { revealOnScroll } from '$lib/utils/revealOnScroll.svelte';
	import { steps } from '$lib/types/steps';
	import NavButton from '$lib/components/ui/NavButton.svelte';
	import { loadMetrics } from '$lib/stores/metricStore.svelte';
	import { flagStore } from '$lib/stores/flagStore.svelte';
	import { validatorStore } from '$lib/stores/validatorStore.svelte';
	import { clearAllStores } from '$lib/utils/clearAll';
	import Card from '$lib/components/ui/Card.svelte';
	import { FLAG_BADGE_MAP, getFlagBadge } from '$lib/utils/colors';
	import InputDataUploader from '$lib/components/data/InputDataUploader.svelte';
	import SourcesUploader from '$lib/components/data/SourcesUploader.svelte';
	import CustomReferenceUploader from '$lib/components/data/CustomReferenceUploader.svelte';
	import screenshot_impact_ana_page from '$lib/assets/screenshot-impact-ana-page.png';
	import InfoModal from '$lib/components/ui/InfoModal.svelte';

	let validationPassed = $state(false);
	let showStepsModal = $state(false);
	let activeStep = $state(0);
	let mounted = $state(false);

	const flagKeys = Object.keys(FLAG_BADGE_MAP);

	const gridData = [
		'flag',
		'no_flag',
		'no_flag',
		'flag',
		'no_flag',
		'no_data',
		'no_flag',
		'no_flag',
		'no_flag',
		'flag',
		'no_flag',
		'no_flag',
		'insufficient_evidence',
		'no_flag',
		'flag',
		'no_flag',
		'no_data',
		'no_flag',
		'flag',
		'no_flag',
		'no_flag',
		'no_flag',
		'no_flag',
		'flag',
		'no_flag',
		'no_flag',
		'no_flag',
		'insufficient_evidence',
		'no_flag',
		'flag',
		'no_flag',
		'no_flag'
	];

	const cells = $derived(
		gridData.map((status, index) => {
			const config = getFlagBadge(status);
			return {
				index,
				status,
				background: config ? config.badgeTintStyle : 'var(--color-no-data-tint)'
			};
		})
	);

	const hasPreviousResults = $derived(
		flagStore.flaggedResult !== null &&
			flagStore.flaggedResult.length > 0 &&
			!validatorStore.validationResult
	);

	function openStep(i: number) {
		activeStep = i;
		showStepsModal = true;
	}

	onMount(() => {
		loadMetrics();
		mounted = true;
	});

	function clearAll() {
		validationPassed = false;
		clearAllStores();
	}
</script>

<svelte:head>
	<title>ANA | Acute Needs Analysis</title>
</svelte:head>

<div class="mx-auto max-w-6xl px-4">
	<!-- ── Hero ────────────────────────────────────────────────────────────────── -->
	<section
		aria-label="Introduction"
		class="mx-auto flex min-h-[calc(100svh-3.5rem)] max-w-5xl flex-col justify-center pt-4 pb-24 lg:pt-0 lg:pb-32"
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
						Screen humanitarian data for
						<span class="text-primary"> Risk of Excess Mortality</span>
					</h1>
					<p
						class="text-base-content/85 mx-auto mt-4 max-w-lg text-lg leading-relaxed lg:mx-0"
						in:fly={{ y: 20, duration: 500, delay: 180, easing: cubicOut, opacity: 0 }}
					>
						Validate, flag, and visualize all units of analysis against reference thresholds —
						automatically. Upload your data and the Acute Needs Analysis (ANA) app does the rest.
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
						<a href="#want-to-know-more" class="btn btn-outline cursor-pointer">
							Want to know more
						</a>
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
									>Priority flag</span
								>
								<span
									class=" border-success/30 bg-success/10 text-success inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold"
									>Processed</span
								>
							</div>

							<!-- Mini heatmap grid -->
							<div class="grid grid-cols-8 gap-1" aria-hidden="true">
								{#each cells as cell (cell.index)}
									<div
										class="cell aspect-square rounded-sm"
										style={cell.background}
										style:--i={cell.index}
									></div>
								{/each}
							</div>

							<!-- Legend badges -->

							<div class="flex flex-wrap gap-1.5">
								{#each flagKeys as key (key)}
									<span class="badge badge-sm" style={getFlagBadge(key)!.badgeStyle}>
										{getFlagBadge(key)!.label}
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
		<InputDataUploader
			onprocessstart={() => (validationPassed = false)}
			onaccepted={() => (validationPassed = true)}
			oncleared={clearAll}
		/>

		<!-- Optional: upload metric sources for deep-dive XLSX annotation -->
		<div class="mt-3">
			<SourcesUploader />
		</div>

		<!-- Optional: customise reference before uploading data -->
		<div class="mt-3">
			<CustomReferenceUploader />
		</div>

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
							class="text-base-content/15 pointer-events-none absolute top-2 right-3 text-8xl leading-none font-bold select-none"
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
		class="alert alert-info alert-outline mt-6 mb-6"
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
			The priority flag is a tool to prioritise which areas to review first — it is not a final
			analytical conclusion. All UoAs should receive a deep dive if time allows.
		</p>
	</div>

	<!-- ── How it works ───────────────────────────────────────────────────────── -->
	<section id="want-to-know-more" aria-labelledby="want-to-know-more" class="mt-16">
		<h2
			id="want-to-know-more-heading"
			class="mb-8 text-center text-lg font-semibold tracking-widest uppercase"
			style="opacity: 0"
			{@attach revealOnScroll({ y: 16, duration: 400 })}
		>
			Want to know more
		</h2>
		<Card
			side
			figureClass="lg:p-4"
			class="mx-auto mb-6 max-w-2xl"
			title="Check out the ANA page on IMPACT Initiatives' website!"
		>
			{#snippet figure()}
				<img src={screenshot_impact_ana_page} alt="ANA page screenshot" />
			{/snippet}
			<p>
				To get more information on the Acute Needs Analysis (ANA) framework and view past global
				analyses, please visit the dedicated page.
			</p>
			<div class="card-actions mt-2 justify-end">
				<a href="https://www.impact-initiatives.org/acute-needs-analysis/" class="btn btn-primary"
					>Visit</a
				>
			</div>
		</Card>

		<!-- ── Modals ──────────────────────────────────────────────────────────────── -->

		<InfoModal bind:isOpen={showStepsModal}>
			<!-- Step nav pills -->
			<div class="mb-5 flex gap-2 pr-8">
				{#each steps as step, i (i)}
					<button
						class={[
							'cursor-pointer rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap transition-colors duration-150',
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
					<p class="text-sm">
						{steps[activeStep].detail.tip}
						{#if steps[activeStep].detail.tipLink}
							{@const tl = steps[activeStep].detail.tipLink!}
							<!-- eslint-disable-next-line svelte/valid-href -->
							<a
								href={resolve(tl.href)}
								class="text-primary font-semibold underline underline-offset-2">{tl.label}</a
							>{tl.suffix ?? ''}
						{/if}
					</p>
				</div>
			{/if}
		</InfoModal>
	</section>
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
