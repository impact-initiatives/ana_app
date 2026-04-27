<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import Select from '$lib/components/ui/Select.svelte';
	import LegendBadge from '$lib/components/ui/LegendBadge.svelte';
	import MetricsStrip from '$lib/components/viz/MetricsStrip.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import { lazyMount } from '$lib/utils/lazyMount.svelte';

	interface DotData {
		uoa: string;
		value: number;
		flagLabel: string;
		within10: boolean | null;
	}
	interface MetricBlock {
		id: string;
		label: string | null;
		indicatorLabel: string;
		threshold: number | null;
		direction: string | null;
		dots: DotData[];
	}
	interface SubfactorBlock {
		subfactorId: string;
		subfactorLabel: string;
		metrics: MetricBlock[];
	}
	interface FactorBlock {
		factorId: string;
		factorLabel: string;
		subfactors: SubfactorBlock[];
	}
	interface SystemBlock {
		systemId: string;
		systemLabel: string;
		factors: FactorBlock[];
	}

	type Option = { value: string; label: string };

	interface Props {
		filteredBlocks: SystemBlock[];
		indSystemOptions: Option[];
		indFactorOptions: Option[];
		indSelectedSystems: string[] | null;
		indSelectedFactors: string[] | null;
		totalMetrics: number;
		onindsystemschange: (v: string | string[]) => void;
		onindfactorschange: (v: string | string[]) => void;
	}

	let {
		filteredBlocks,
		indSystemOptions,
		indFactorOptions,
		indSelectedSystems,
		indSelectedFactors,
		totalMetrics,
		onindsystemschange,
		onindfactorschange
	}: Props = $props();

	const visibleMetricIds = new SvelteSet<string>();
</script>

<section>
	<h1 class="border-primary mb-8 border-l-6 pl-3 text-2xl font-semibold tracking-widest uppercase">
		Metrics
	</h1>

	<div class="space-y-6">
		<!-- Filters -->
		<Card>
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<Select
					label="Systems"
					options={indSystemOptions}
					selected={indSelectedSystems ?? indSystemOptions.map((o) => o.value)}
					placeholder="Select systems…"
					onchange={onindsystemschange}
				/>
				<Select
					label="Factors"
					options={indFactorOptions}
					selected={indSelectedFactors ?? indFactorOptions.map((o) => o.value)}
					placeholder="Select factors…"
					onchange={onindfactorschange}
				/>
			</div>
			<p class="text-primary mt-2 text-xs">
				Showing {totalMetrics} metric{totalMetrics !== 1 ? 's' : ''}
				across {filteredBlocks.length} system{filteredBlocks.length !== 1 ? 's' : ''}. Dropdowns
				display only systems and factors that have metrics with data.
			</p>
		</Card>

		<LegendBadge keys={['flag', 'no_flag']} tinted={false} btnCircle>
			{#snippet extra()}
				<span class="flex items-center gap-1.5">
					<span
						class="inline-block h-2.5 w-2.5 rounded-full ring-2 ring-(--color-within10) ring-offset-1"
					></span>
					Within 10% of threshold
				</span>
				<span class="flex items-center gap-1.5">
					<span class="h-4 border-l-2 border-dashed border-(--color-within10)"></span>
					<span class="font-mono text-xs text-(--color-within10)">AN</span> threshold
				</span>
			{/snippet}
		</LegendBadge>

		{#if filteredBlocks.length === 0}
			<div class="alert alert-warning alert-soft">
				<span
					>No metrics match the current filters. Try selecting more systems, factors, or UOAs.</span
				>
			</div>
		{:else}
			{#each filteredBlocks as sys (sys.systemId)}
				<section>
					<h3 class="border-primary mb-4 border-l-4 pl-3 text-lg font-semibold tracking-wide">
						{sys.systemLabel}
					</h3>
					<div class="space-y-8">
						{#each sys.factors as fac (fac.factorId)}
							<div>
								<h4 class="text-base-content/70 mb-3 text-lg font-semibold">
									{fac.factorLabel}
								</h4>
								<div class="space-y-4">
									{#each fac.subfactors as sf (sf.subfactorId)}
										<div>
											<h5
												class="text-base-content/50 mb-3 text-xs font-semibold tracking-widest uppercase"
											>
												{sf.subfactorLabel}
											</h5>
											<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
												{#each sf.metrics as met (met.id)}
													<div {@attach lazyMount(() => visibleMetricIds.add(met.id))}>
														<Card>
															<div class="mb-1 flex flex-wrap items-baseline gap-2">
																<span class="font-mono text-xs font-bold">{met.id}</span>
																<span class="text-base-content/60 text-xs"
																	>{met.indicatorLabel}</span
																>
																{#if met.label}
																	<span class="text-base-content/80 text-xs italic"
																		>— {met.label}</span
																	>
																{/if}
																<span class="text-base-content/80 ml-auto text-xs">
																	{met.dots.length} UOA{met.dots.length !== 1 ? 's' : ''}
																</span>
															</div>
															{#if visibleMetricIds.has(met.id)}
																<MetricsStrip
																	threshold={met.threshold}
																	direction={met.direction}
																	dots={met.dots}
																	height={120}
																/>
															{:else}
																<div class="bg-base-200 h-[120px] animate-pulse rounded"></div>
															{/if}
														</Card>
													</div>
												{/each}
											</div>
										</div>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/each}
		{/if}
	</div>
</section>
