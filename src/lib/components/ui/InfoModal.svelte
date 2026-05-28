<script lang="ts">
	import type { Snippet } from 'svelte';

	// --- Types ---
	export interface InfoItem {
		id: string;
		title: string;
		content: string | string[];
		badgeType?: 'required' | 'optional' | 'info';
		badgeLabel?: string;
	}

	interface InfoBlock {
		messagePrefix: string;
		href: string;
		text: string;
		suffix?: string;
	}

	// --- Props with $props() ---
	let {
		isOpen = $bindable(false),
		title = '',
		description = '',
		items = [],
		topInfo = null,
		bottomInfo = null,
		children
	}: {
		isOpen?: boolean;
		title?: string;
		description?: string;
		items?: InfoItem[];
		topInfo?: InfoBlock | null;
		bottomInfo?: InfoBlock | null;
		children?: Snippet;
	} = $props();

	// --- State with $state() ---
	let element: HTMLDialogElement | null = $state(null);

	// --- Derived/Constants ---
	// Using $derived for consistency, though a const object is also fine if it doesn't depend on props
	const badgeMap = $derived<Record<string, string>>({
		required: 'badge-error',
		optional: 'badge-primary',
		info: 'badge-secondary'
	});

	// --- Actions ---
	function close() {
		isOpen = false;
	}

	// Drive native dialog open/close state from isOpen
	$effect(() => {
		if (!element) return;
		if (isOpen) element.showModal();
		else if (element.open) element.close();
	});
</script>

<dialog bind:this={element} class="modal">
	<div class="modal-box max-w-lg">
		<form method="dialog">
			<button
				class="btn btn-xs btn-circle btn-ghost btn-outline absolute top-3 right-3 cursor-pointer"
				aria-label="Close"
				onclick={close}
			>
				✕
			</button>
		</form>

		{#if children}
			{@render children()}
		{:else}
			<h3 class="text-lg font-bold">{title}</h3>
			{#if description}
				<p class="text-base-content/85 text-md mt-1">{description}</p>
			{/if}

			<!-- TOP INFO BLOCK -->
			{#if topInfo}
				<div
					class="border-primary/20 bg-primary/6 mt-5 flex items-center gap-2.5 rounded-lg border px-4 py-3"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-primary size-4 shrink-0"
						viewBox="0 0 20 20"
						fill="currentColor"
						aria-hidden="true"
					>
						<path
							fill-rule="evenodd"
							d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
							clip-rule="evenodd"
						/>
					</svg>
					<p class="text-sm">
						{topInfo.messagePrefix}
						<!-- eslint-disable-next-line svelte/valid-href -->
						<a href={topInfo.href} class="text-primary font-semibold underline underline-offset-2"
							>{topInfo.text}</a
						>
						{#if topInfo.suffix}{topInfo.suffix}{/if}
					</p>
				</div>
			{/if}

			<!-- LIST OF ITEMS -->
			<div class="text-base-content/85 mt-5 space-y-3 text-sm">
				{#each items as item (item.id)}
					<div class="border-base-300 bg-base-200/40 rounded-lg border px-4 py-3.5">
						<div class="flex items-center justify-between gap-2">
							<p class="text-base-content font-semibold">{item.title}</p>
							{#if item.badgeType}
								<span class={`badge ${badgeMap[item.badgeType]} badge-sm`}>
									{item.badgeLabel || item.badgeType}
								</span>
							{/if}
						</div>
						{#if Array.isArray(item.content)}
							{#each item.content as para, i (i)}
								<p class="mt-1">{para}</p>
							{/each}
						{:else}
							<p class="mt-1">{item.content}</p>
						{/if}
					</div>
				{/each}
			</div>

			<!-- BOTTOM INFO BLOCK -->
			{#if bottomInfo}
				<div
					class="border-primary/20 bg-primary/6 mt-5 flex items-center gap-2.5 rounded-lg border px-4 py-3"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-primary size-4 shrink-0"
						viewBox="0 0 20 20"
						fill="currentColor"
						aria-hidden="true"
					>
						<path
							fill-rule="evenodd"
							d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
							clip-rule="evenodd"
						/>
					</svg>
					<p class="text-sm">
						{bottomInfo.messagePrefix}
						<!-- eslint-disable-next-line svelte/valid-href -->
						<a
							href={bottomInfo.href}
							class="text-primary font-semibold underline underline-offset-2">{bottomInfo.text}</a
						>
						{#if bottomInfo.suffix}{bottomInfo.suffix}{/if}
					</p>
				</div>
			{/if}
		{/if}
	</div>
	<form method="dialog" class="modal-backdrop">
		<button onclick={close}>close</button>
	</form>
</dialog>
