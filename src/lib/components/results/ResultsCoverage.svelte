<script lang="ts">
	import Select from '$lib/components/ui/Select.svelte';
	import RadioToggle from '$lib/components/ui/RadioToggle.svelte';
	import CoverageDetailCards from '$lib/components/viz/CoverageDetailCards.svelte';
	import HealthOutcomesCoverage from '$lib/components/viz/HealthOutcomesCoverage.svelte';
	import { uoaLabel } from '$lib/stores/adminFeaturesStore.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import { fade } from 'svelte/transition';

	type Row = Record<string, any>;

	interface Props {
		coverageUoaOptions: string[];
		coverageUoa: string;
		coverageSelectedRow: Row | null;
		filteredRows: Row[];
		systems: { id: string; label: string }[];
		referenceJson: unknown;
		oncoverageUoaChange: (v: string) => void;
	}

	let {
		coverageUoaOptions,
		coverageUoa,
		coverageSelectedRow,
		filteredRows,
		systems,
		referenceJson,
		oncoverageUoaChange
	}: Props = $props();

	// Tab: 'coverage' | 'health-outcomes'
	let coverageTab = $state(false); // false = Coverage (default), true = Health outcomes coverage

	// false = Overall (default), true = Per UoA
	let isPerUoa = $state(false);

	// HO metrics: non-supporting-evidence metrics in health_outcomes system
	const hoMetricIds = $derived.by((): string[] => {
		const j = referenceJson as any;
		if (!j?.systems) return [];
		const hoSystem = j.systems.find((s: any) => s.id === 'health_outcomes');
		if (!hoSystem) return [];
		const ids: string[] = [];
		for (const factor of hoSystem.factors ?? []) {
			for (const sub of factor.sub_factors ?? []) {
				for (const ind of sub.indicators ?? []) {
					for (const m of ind.metrics ?? []) {
						if (m?.metric && m.evidence_type !== 'Supporting evidence') ids.push(m.metric);
					}
				}
			}
		}
		return ids;
	});

	// Aggregated row: sum flag_n / no_flag_n / missing_n across all filtered rows,
	// plus uoa_flagged_n (count of rows where that system/factor is flagged).
	const overallRow = $derived.by<Row>(() => {
		const json = referenceJson as any;
		const agg: Row = { uoa: '__overall__' };
		if (!json?.systems || filteredRows.length === 0) return agg;

		for (const sys of json.systems) {
			const sysId: string = sys.id;
			let sUoaFlagged = 0,
				sUoaNoFlag = 0,
				sUoaInsuff = 0,
				sUoaNoData = 0;

			for (const row of filteredRows) {
				const st = String(row[`${sysId}.status`] ?? 'no_data');
				if (st === 'flag') sUoaFlagged++;
				else if (st === 'no_flag') sUoaNoFlag++;
				else if (st === 'insufficient_evidence') sUoaInsuff++;
				else sUoaNoData++;
			}

			agg[`${sysId}.uoa_flagged_n`] = sUoaFlagged;
			agg[`${sysId}.uoa_no_flag_n`] = sUoaNoFlag;
			agg[`${sysId}.uoa_insuff_n`] = sUoaInsuff;
			agg[`${sysId}.uoa_no_data_n`] = sUoaNoData;

			if (!Array.isArray(sys.factors)) continue;
			for (const factor of sys.factors) {
				const fKey = `${sysId}.${factor.id}`;
				let fUoaFlagged = 0,
					fUoaNoFlag = 0,
					fUoaInsuff = 0,
					fUoaNoData = 0;

				for (const row of filteredRows) {
					const ft = String(row[`${fKey}.status`] ?? 'no_data');
					if (ft === 'flag') fUoaFlagged++;
					else if (ft === 'no_flag') fUoaNoFlag++;
					else if (ft === 'insufficient_evidence') fUoaInsuff++;
					else fUoaNoData++;
				}

				agg[`${fKey}.uoa_flagged_n`] = fUoaFlagged;
				agg[`${fKey}.uoa_no_flag_n`] = fUoaNoFlag;
				agg[`${fKey}.uoa_insuff_n`] = fUoaInsuff;
				agg[`${fKey}.uoa_no_data_n`] = fUoaNoData;
			}
		}

		return agg;
	});

	const activeRow = $derived(isPerUoa ? coverageSelectedRow : overallRow);
</script>

<section>
	<h1 class="border-primary mb-8 border-l-6 pl-3 text-2xl font-semibold tracking-widest uppercase">
		Data Coverage
	</h1>

	<div class="space-y-4">
		<!-- Tab + controls -->
		<Card>
			<div class="flex flex-wrap items-center gap-6">
				<RadioToggle
					bind:value={coverageTab}
					label="Scope"
					labelFalse="Overall"
					labelTrue="Health Outcomes"
					name="coverageScope"
				/>

				<RadioToggle
					bind:value={isPerUoa}
					label="Level"
					labelFalse="Overall"
					labelTrue="Per UoA"
					name="coverageLevel"
				/>
				{#if isPerUoa}
					<div transition:fade={{ duration: 150 }}>
						<Select
							label="Unit of analysis"
							class="w-80"
							options={coverageUoaOptions.map((uoa) => ({ value: uoa, label: uoaLabel(uoa) }))}
							selected={coverageUoa}
							placeholder="Select UOA…"
							labelPosition="left"
							onchange={(val) => oncoverageUoaChange(Array.isArray(val) ? (val[0] ?? '') : val)}
						/>
					</div>
				{/if}
			</div>
		</Card>

		{#if !coverageTab && activeRow !== null}
			<div transition:fade={{ duration: 150 }}>
				<CoverageDetailCards
					row={activeRow}
					{systems}
					{referenceJson}
					mode={isPerUoa ? 'per-uoa' : 'overall'}
					totalUoas={filteredRows.length}
				/>
			</div>
		{:else if coverageTab}
			<div transition:fade={{ duration: 150 }}>
				<HealthOutcomesCoverage
					rows={filteredRows}
					{hoMetricIds}
					{referenceJson}
					mode={isPerUoa ? 'per-uoa' : 'overall'}
					selectedUoa={isPerUoa ? coverageUoa : null}
				/>
			</div>
		{/if}
	</div>
</section>
