<script lang="ts">
	import SystemCoverageBars from '$lib/components/viz/SystemCoverageBars.svelte';
	import SystemMatrix from '$lib/components/viz/SystemMatrix.svelte';

	type Row = Record<string, any>;
	type System = { id: string; label: string };

	interface Props {
		filteredFlagged: Row[];
		systems: System[];
		systemCodes: Map<string, string[]>;
		subList: { path: string; codes: string[] }[];
		referenceJson: unknown;
		selectedUoa: string | null;
		selectedSystem: string | null;
	}

	let {
		filteredFlagged,
		systems,
		systemCodes,
		subList,
		referenceJson,
		selectedUoa = $bindable(null),
		selectedSystem = $bindable(null)
	}: Props = $props();
</script>

<section>
	<h1 class="border-primary mb-8 border-l-6 pl-3 text-2xl font-semibold tracking-widest uppercase">
		Systems
	</h1>

	<!-- Guide + Coverage bars: side-by-side -->
	<div class="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-5">
		<!-- How-to guide (left) -->
		<div
			class="card border-base-300 bg-base-200/60 space-y-6 rounded-xl border p-4 shadow-lg lg:col-span-2"
		>
			<p class="text-base-content/85 text-xs font-semibold tracking-widest uppercase">
				How to explore
			</p>
			<div class="flex items-start gap-3 text-sm">
				<span
					class="bg-primary/15 text-primary flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
					>1</span
				>
				<p class="text-base-content/80">
					<strong class="text-base-content font-semibold">Coverage bars</strong> — Each bar shows how
					many UoAs received a flag, no flag, insufficient evidence, or had no data for that system.
				</p>
			</div>
			<div class="flex items-start gap-3 text-sm">
				<span
					class="bg-primary/15 text-primary flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
					>2</span
				>
				<p class="text-base-content/80">
					<strong class="text-base-content font-semibold">System matrix</strong> — Maps every area
					(rows) against every system (columns). Color encodes flag status.
					<strong>Click a cell</strong> to drill into that UoA × system.
				</p>
			</div>
			<div class="flex items-start gap-3 text-sm">
				<span
					class="bg-primary/15 text-primary flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
					>3</span
				>
				<p class="text-base-content/80">
					<strong class="text-base-content font-semibold">Drill-down panel</strong> — After clicking,
					individual metric values and flag statuses appear below. Use the radio buttons to filter by
					preference level or status.
				</p>
			</div>
		</div>

		<!-- Coverage bars (right) -->
		<div class="lg:col-span-3">
			<SystemCoverageBars rows={filteredFlagged} {systems} />
		</div>
	</div>

	<SystemMatrix
		rows={filteredFlagged}
		{systems}
		{systemCodes}
		{subList}
		{referenceJson}
		bind:selectedUoa
		bind:selectedSystem
	/>
</section>
