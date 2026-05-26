<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getFlagBadge, getPriorityBadge, getConclusionBadge } from '$lib/utils/colors';

	interface Props {
		/** FLAG_BADGE keys to display. Default: the four main statuses. */
		keys?: readonly string[];
		/** priorityBadge keys to display after FLAG_BADGE keys. Default: none. */
		priorityKeys?: readonly string[];
		/** Conclusion badge keys to display (uses CONCLUSION_BADGE_MAP hex colors). */
		conclusionKeys?: readonly string[];
		/** Use solid colours for FLAG_BADGE swatches instead of tinted. Default true = tinted. */
		tinted?: boolean;
		/** Render FLAG_BADGE swatches as btn-circle buttons. Default false = small square. */
		btnCircle?: boolean;
		/** Tailwind text-size class. Default 'text-sm'. */
		size?: string;
		/** Extra items appended after the status badges (e.g. custom threshold markers). */
		extra?: Snippet;
	}

	let {
		keys = ['flag', 'no_flag', 'insufficient_evidence', 'no_data'],
		priorityKeys = [],
		conclusionKeys = [],
		tinted = true,
		btnCircle = false,
		size = 'text-sm',
		extra
	}: Props = $props();

	function swatchVar(fb: { colorVar: string; tintVar: string }) {
		return tinted ? fb.tintVar : fb.colorVar;
	}
</script>

<div class="text-base-content/85 mt-3 flex flex-col gap-1.5 {size}">
	<!-- Status badges row (hidden when keys is empty) -->
	{#if keys.length > 0}
		<div class="flex flex-wrap items-center gap-x-4 gap-y-1.5">
			<span class="font-semibold">{priorityKeys.length > 0 ? 'System:' : 'Legend:'}</span>
			{#each keys as fk (fk)}
				{@const fb = getFlagBadge(fk)}
				{#if fb}
					<span class="flex items-center gap-1">
						{#if btnCircle}
							<span
								class="btn btn-circle badge-xs"
								style="background-color: var({swatchVar(fb)}); color: var(--color-base-content)"
							></span>
						{:else}
							<span
								class="inline-block h-3 w-3 rounded"
								style="background-color: var({swatchVar(fb)})"
							></span>
						{/if}
						{fb.label}
					</span>
				{/if}
			{/each}
			{#if extra}
				{@render extra()}
			{/if}
		</div>
	{/if}

	<!-- Prelim badges row -->
	{#if priorityKeys.length > 0}
		<div class="flex flex-wrap items-center gap-x-4 gap-y-1.5">
			<span class="font-semibold">Priority flag:</span>
			{#each priorityKeys as pk (pk)}
				{@const pb = getPriorityBadge(pk)}
				{#if pb}
					<span class="flex items-center gap-1">
						{#if btnCircle}
							<span
								class="btn btn-circle badge-sm"
								style="background-color: {tinted && pb.tintBg ? pb.tintBg : pb.bg}"
							></span>
						{:else}
							<span
								class="inline-block h-3 w-3 rounded"
								style="background-color: {tinted && pb.tintBg ? pb.tintBg : pb.bg}"
							></span>
						{/if}
						{pb.label}
					</span>
				{/if}
			{/each}
		</div>
	{/if}

	<!-- Conclusion badges row -->
	{#if conclusionKeys.length > 0}
		<div class="flex flex-wrap items-center gap-x-4 gap-y-1.5">
			<span class="font-semibold">Conclusion:</span>
			{#each conclusionKeys as ck (ck)}
				{@const cb = getConclusionBadge(ck)}
				{#if cb}
					<span class="flex items-center gap-1">
						<span class="inline-block h-3 w-3 rounded" style="background-color: {cb.bg}"></span>
						{cb.label}
					</span>
				{/if}
			{/each}
		</div>
	{/if}
</div>
