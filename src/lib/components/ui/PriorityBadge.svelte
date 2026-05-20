<script lang="ts">
	import { getPriorityBadge } from '$lib/utils/colors';

	interface Props {
		/** Priority flag key — e.g. 'em', 'ho_primary', 'an_primary', 'no_data', 'no_acute_needs' */
		value: string;
		/** Optional extra classes on the <span> */
		class?: string;
	}

	let { value, class: cls = '' }: Props = $props();

	const badge = $derived(getPriorityBadge(value));
</script>

{#if badge}
	<span
		class="inline-block rounded px-2 py-0.5 text-xs leading-snug font-medium {cls}"
		style:background-color={badge.bg}
		style:color={badge.textColor ?? 'var(--color-base-content)'}>{badge.label}</span
	>
{/if}
