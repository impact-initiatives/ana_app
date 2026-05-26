<script lang="ts">
	import type { SynthesisRow } from '$lib/engine/mergeDeepDives';
	import { conclusionToFlag } from '$lib/engine/mergeDeepDives';
	import { getConclusionBadge, PRIORITY_BADGE_MAP } from '$lib/utils/colors';

	interface Props {
		uoa: string;
		adminName: string;
		rows: SynthesisRow[];
		open: boolean;
		onclose: () => void;
	}

	let { uoa, adminName, rows, open, onclose }: Props = $props();

	let dialogEl = $state<HTMLDialogElement | null>(null);

	$effect(() => {
		if (open) dialogEl?.showModal();
		else dialogEl?.close();
	});

	// Unique tabs in appearance order
	const tabs = $derived([...new Map(rows.map((r) => [r.tab, r.tab])).keys()]);

	let activeTab = $state('');

	// Reset to first tab whenever the UoA changes
	$effect(() => {
		uoa;
		if (tabs.length) activeTab = tabs[0];
	});

	const activeRows = $derived(rows.filter((r) => r.tab === activeTab));
	const anyDeepDiveRun = $derived(rows.some((r) => r.deepDiveRun));

	// Header badges
	const pfBadge = $derived(
		Object.values(PRIORITY_BADGE_MAP).find((b) => b.label === rows[0]?.priorityFlag) ?? null
	);
	const conclusionStr = $derived(rows.find((r) => r.conclusion)?.conclusion ?? '');
	const conclusionKey = $derived(conclusionStr ? (conclusionToFlag(conclusionStr) ?? null) : null);
	const cBadge = $derived(conclusionKey ? getConclusionBadge(conclusionKey) : null);
</script>

<dialog bind:this={dialogEl} class="modal" {onclose}>
	<div class="modal-box w-11/12 max-w-3xl">
		<!-- ── Header ── -->
		<div class="mb-4 flex flex-wrap items-start justify-between gap-3">
			<div class="min-w-0">
				<h3 class="truncate text-lg font-bold">{adminName || uoa}</h3>
				{#if adminName}
					<p class="text-base-content/85 text-sm">{uoa}</p>
				{/if}
			</div>
			<div class="flex flex-wrap items-center gap-2">
				{#if pfBadge}
					<span
						class="rounded-full px-2.5 py-0.5 text-xs font-semibold"
						style="background:{pfBadge.bg}; color:{pfBadge.textColor ?? '#fff'}"
					>
						{pfBadge.label}
					</span>
				{/if}
				{#if cBadge}
					<span
						class="rounded-full px-2.5 py-0.5 text-xs font-semibold"
						style="background:{cBadge.bg}; color:#fff"
					>
						{cBadge.label}
					</span>
				{:else}
					<span class="text-base-content/85 text-xs">No conclusion</span>
				{/if}
				<button class="btn btn-ghost btn-circle btn-sm ml-1 shrink-0" onclick={onclose}>✕</button>
			</div>
		</div>

		{#if !anyDeepDiveRun}
			<p class="text-base-content/60 py-4 text-sm italic">No deep dive run</p>
		{:else}
			<!-- ── Tab strip (only shown when multiple tabs) ── -->
			{#if tabs.length > 1}
				<div class="tabs tabs-border mb-4" role="tablist">
					{#each tabs as tab (tab)}
						<button
							role="tab"
							class="tab {activeTab === tab ? 'tab-active' : ''}"
							onclick={() => (activeTab = tab)}
						>
							{tab}
						</button>
					{/each}
				</div>
			{/if}

			<!-- ── System cards ── -->
			<div class="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
				{#each activeRows as r (r.system)}
					{@const hasContent =
						r.primaryHypothesis ||
						r.secondaryHypothesis ||
						r.plausibility ||
						r.triangulation ||
						r.summary}
					<div class="rounded-box border-base-300 border p-4">
						<h4 class="mb-3 text-sm font-semibold">{r.system}</h4>
						{#if !hasContent}
							<p class="text-base-content/75 text-sm italic">No content</p>
						{:else}
							<dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
								{#if r.primaryHypothesis}
									<dt class="text-base-content/75 font-medium whitespace-nowrap">Primary H</dt>
									<dd>{r.primaryHypothesis}</dd>
								{/if}
								{#if r.secondaryHypothesis}
									<dt class="text-base-content/75 font-medium whitespace-nowrap">Secondary H</dt>
									<dd>{r.secondaryHypothesis}</dd>
								{/if}
								{#if r.plausibility}
									<dt class="text-base-content/75 font-medium whitespace-nowrap">Plausibility</dt>
									<dd>{r.plausibility}</dd>
								{/if}
								{#if r.triangulation}
									<dt class="text-base-content/75 font-medium whitespace-nowrap">Triangulation</dt>
									<dd>{r.triangulation}</dd>
								{/if}
							</dl>
							{#if r.summary}
								<p class="border-base-200 mt-2.5 border-t pt-2.5 text-sm">{r.summary}</p>
							{/if}
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
