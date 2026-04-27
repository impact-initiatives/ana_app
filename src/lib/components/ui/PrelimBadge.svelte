<script lang="ts">
	import { getPrelimBadge } from '$lib/utils/colors';

	interface Props {
		/** Prelim flag key — lowercase snake_case: 'em', 'roem', 'acute', 'acute_needs', 'insufficient_evidence', 'no_data' */
		value: string;
		/** Optional extra classes on the <span> */
		class?: string;
	}

	let { value, class: cls = '' }: Props = $props();

	const badge = $derived(getPrelimBadge(value));
</script>

{#if badge}
	<span
		class="text-base-content inline-block rounded px-2 py-0.5 text-xs leading-snug font-medium {cls}"
		style:background-color={badge.bg}>{badge.label}</span
	>
{/if}
