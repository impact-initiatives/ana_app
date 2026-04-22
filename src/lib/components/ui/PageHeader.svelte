<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Page title */
		title: string;
		/** Optional subtitle shown below the title */
		subtitle?: string;
		/** Optional slot rendered to the right of the title, vertically centered */
		action?: Snippet;
		/** Optional extra classes on the wrapper <div> */
		class?: string;
		/** Optional gap between title and action */
		gap?: string;
	}

	let { title, subtitle, action, class: cls = '', gap = 'gap-3 md:gap-50' }: Props = $props();
</script>

<div class="mb-6 {cls}">
	<div class="flex flex-col md:flex-row md:justify-between {gap}">
		<div>
			<h1 class="text-3xl font-semibold">{title}</h1>
			{#if subtitle}
				<p class="text-base-content/85 mt-1">{subtitle}</p>
			{/if}
		</div>
		{#if action}
			<div class="shrink-0">{@render action()}</div>
		{/if}
	</div>
</div>
