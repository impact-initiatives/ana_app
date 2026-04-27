<script lang="ts">
	interface Props {
		value?: string;
		placeholder?: string;
		extraClass?: string;
		required?: boolean;
		oninput?: (value: string) => void;
	}

	let {
		value = $bindable(''),
		placeholder = 'Search…',
		extraClass = '',
		required = false,
		oninput
	}: Props = $props();
</script>

<label
	class={'input input-sm text-base-content border-base-content/30 border bg-base-100 ' + extraClass}
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
		class="grow"
		{placeholder}
		bind:value
		oninput={() => oninput?.(value)}
		aria-label={placeholder}
		{required}
	/>
</label>
