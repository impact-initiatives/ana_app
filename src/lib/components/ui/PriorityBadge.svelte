<script lang="ts">
	import { getPriorityBadge, priorityBadgeTextColor } from '$lib/utils/colors';
	import { themeStore } from '$lib/stores/themeStore.svelte';

	interface Props {
		/** Priority flag key — e.g. 'em', 'ho_primary', 'an_primary', 'no_data', 'no_acute_needs' */
		value: string;
		/** Optional extra classes on the <span> */
		class?: string;
	}

	let { value, class: cls = '' }: Props = $props();

	const badge = $derived(getPriorityBadge(value));
	const textColor = $derived(badge ? priorityBadgeTextColor(badge, themeStore.isDark) : 'var(--color-base-content)');
</script>

{#if badge}
	<span
		class="inline-block rounded px-2 py-0.5 text-xs leading-snug font-medium {cls}"
		style:background-color={badge.bg}
		style:color={textColor}>{badge.label}</span
	>
{/if}
