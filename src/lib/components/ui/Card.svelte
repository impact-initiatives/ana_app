<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Shadow depth. Defaults to 'sm'. */
		shadow?: 'none' | 'sm' | 'md' | 'lg';
		/** Extra classes on the outer card element. */
		class?: string;
		/** Inline style on the outer card element (e.g. for dynamic border colours). */
		style?: string;
		/** Extra classes on the inner card-body element. */
		bodyClass?: string;
		/** Title text rendered as a card-title heading by the card itself. */
		title?: string;
		/** Subtitle rendered below the title. */
		subtitle?: string;
		/** Transforms the title to uppercase. */
		titleUppercase?: boolean;
		/** Applies font-semibold to the title. */
		titleSemibold?: boolean;
		/** Text-size class for the title, e.g. 'text-sm', 'text-base'. Defaults to card-title sizing. */
		titleSize?: string;
		/** Optional snippet rendered inline beside the title (e.g. an action button). */
		titleActions?: Snippet;
		/** Transforms the subtitle to uppercase. */
		subtitleUppercase?: boolean;
		/** Applies font-semibold to the subtitle. */
		subtitleSemibold?: boolean;
		/** Text-size class for the subtitle, e.g. 'text-sm', 'text-base'. Defaults to normal text. */
		subtitleSize?: string;
		/** How dimmed is subtitle, e.g. 'text-base-content/50' then 50, 'text-base-content/75' then 75. Defaults to 'text-base-content/75'. Number must be between 0 and 100. */
		subtitleDim?: number;
		/** Optional snippet rendered inline beside the subtitle (e.g. an action button). */
		subtitleActions?: Snippet;
		/** Optional snippet rendered as a <figure> before the card body (e.g. an image). */
		figure?: Snippet;
		/** Extra classes on the <figure> element. */
		figureClass?: string;
		/** Adds lg:card-side for a horizontal layout when a figure is present. */
		side?: boolean;
		children: Snippet;
	}

	let {
		shadow = 'sm',
		class: extraClass = '',
		style: extraStyle = '',
		bodyClass = '',
		title,
		subtitle,
		titleUppercase = false,
		titleSemibold = false,
		titleSize = '',
		titleActions,
		subtitleUppercase = false,
		subtitleSemibold = false,
		subtitleSize = '',
		subtitleDim = 85,
		subtitleActions,
		figure,
		figureClass = '',
		side = false,
		children
	}: Props = $props();

	// Full class strings must appear literally so Tailwind includes them in the bundle.
	const SHADOW_CLASSES = {
		none: '',
		sm: 'shadow-sm',
		md: 'shadow-md',
		lg: 'shadow-lg'
	} as const;
</script>

<div
	class={[
		'card bg-base-100 border-base-300 border',
		side && 'lg:card-side',
		SHADOW_CLASSES[shadow],
		extraClass
	]}
	style={extraStyle}
>
	{#if figure}
		<figure class={figureClass}>
			{@render figure()}
		</figure>
	{/if}
	<div class={['card-body', bodyClass]}>
		{#if title || subtitle}
			<div class="mb-2">
				{#if title}
					<div class="flex items-center justify-between gap-4">
						<h2
							class={[
								'card-title',
								titleSize,
								titleUppercase && 'uppercase',
								titleSemibold && 'font-semibold'
							]}
						>
							{title}
						</h2>
						{#if titleActions}
							{@render titleActions()}
						{/if}
					</div>
				{/if}
				{#if subtitle}
					<p
						class={[
							`text-base-content/${subtitleDim}`,
							subtitleSize,
							subtitleUppercase && 'uppercase',
							subtitleSemibold && 'font-semibold'
						]}
					>
						{subtitle}
					</p>
					{#if subtitleActions}
						{@render subtitleActions()}
					{/if}
				{/if}
			</div>
		{/if}
		{@render children()}
	</div>
</div>
