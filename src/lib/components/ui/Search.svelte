<script lang="ts">
	interface Props {
		value?: string;
		placeholder?: string;
		extraClass?: string;
		required?: boolean;
		oninput?: (value: string) => void;
		onkeydown?: (e: KeyboardEvent) => void;
		inputEl?: HTMLInputElement;
	}

	let {
		value = $bindable(''),
		inputEl = $bindable(undefined),
		placeholder = 'Search…',
		extraClass = '',
		required = false,
		oninput,
		onkeydown
	}: Props = $props();
</script>

<label
	class={'input input-sm text-base-content border-base-content/50 bg-base-100 focus-within:border-primary border focus-within:border-2 focus-within:shadow-none focus-within:outline-none ' +
		extraClass}
>
	<svg
		class="h-[1em] opacity-80"
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 24 24"
		aria-hidden="true"
	>
		<g
			stroke-linejoin="round"
			stroke-linecap="round"
			stroke-width="2.5"
			fill="none"
			stroke="currentColor"
		>
			<circle cx="11" cy="11" r="8"></circle>
			<path d="m21 21-4.3-4.3"></path>
		</g>
	</svg>
	<input
		type="search"
		class="grow outline-none focus:outline-none focus-visible:outline-none focus:shadow-none"
		{placeholder}
		bind:value
		bind:this={inputEl}
		oninput={() => oninput?.(value)}
		{onkeydown}
		aria-label={placeholder}
		{required}
	/>
</label>
