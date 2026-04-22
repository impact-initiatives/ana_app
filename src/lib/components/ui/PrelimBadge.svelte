<script lang="ts">
	import { PRELIM_FLAG_BADGE } from '$lib/utils/colors';

	interface Props {
		/** Prelim flag key: "EM", "ROEM", "ACUTE", "NO_ACUTE", "INSUFFICIENT_EVIDENCE", "NO_DATA" */
		value: string;
		/** Optional extra classes on the <span> */
		class?: string;
	}

	let { value, class: cls = '' }: Props = $props();

	const badge = $derived(PRELIM_FLAG_BADGE[value]);
</script>

{#if badge}
	<span
		class="text-base-content inline-block rounded px-2 py-0.5 text-xs leading-snug font-medium {cls}"
		style:background-color={badge.bg}>{badge.label}</span
	>
{/if}
