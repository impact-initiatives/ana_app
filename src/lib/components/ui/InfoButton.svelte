<script lang="ts">
	interface Props {
		label?: string;
		title?: string;
		size?: 'xs' | 'sm' | 'md' | 'lg';
		class?: string;
		disabled?: boolean;
		onclick?: () => void;
	}

	let {
		label = 'More info',
		title = '',
		size = 'sm',
		class: additionalClasses = '',
		disabled = false,
		onclick
	}: Props = $props();

	const sizeMap: Record<string, string> = { xs: 'btn-xs', sm: 'btn-sm', md: 'btn-md', lg: 'btn-lg' };
	const sizeCls = $derived(sizeMap[size] ?? 'btn-sm');
</script>

<button
	type="button"
	class="btn btn-primary btn-outline {sizeCls} {additionalClasses}"
	{disabled}
	{onclick}
	aria-label={title || label}
>
	<svg
		xmlns="http://www.w3.org/2000/svg"
		class="size-3.5"
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
	{label}
</button>
