<script lang="ts">
	interface Props {
		/** The click handler to trigger the download */
		onclick: () => void;
		/** Button label. Defaults to 'Download' */
		label?: string;
		/** Visual variant */
		variant?:
			| 'outline'
			| 'primary'
			| 'secondary'
			| 'warning'
			| 'success'
			| 'error'
			| 'neutral'
			| 'accent';
		/** Additional CSS classes */
		class?: string;
		/** Size */
		size?: 'sm' | 'md' | 'lg';
		/** Disable the button */
		disabled?: boolean;
	}

	let {
		onclick,
		label = 'Download',
		variant = 'outline',
		size = 'sm',
		class: additionalClasses = '',
		disabled = false
	}: Props = $props();

	// Derive classes
	const variantCls = $derived(`btn-${variant}`);
	const sizeCls = $derived(size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : 'btn-md');

	// Auto-calculate aria-label if not explicitly provided
	const ariaLabel = `Download button: ${label}`;
</script>

<button
	{onclick}
	class="btn {variantCls} {sizeCls} gap-1.5 {additionalClasses}"
	aria-label={ariaLabel}
	{disabled}
>
	<svg
		xmlns="http://www.w3.org/2000/svg"
		class="size-4"
		viewBox="0 0 20 20"
		fill="currentColor"
		aria-hidden="true"
	>
		<path
			fill-rule="evenodd"
			d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
			clip-rule="evenodd"
		/>
	</svg>
	{label}
</button>
