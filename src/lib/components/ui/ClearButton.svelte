<script lang="ts">
	interface Props {
		label?: string;
		variant?:
			| 'outline'
			| 'primary'
			| 'secondary'
			| 'warning'
			| 'success'
			| 'error'
			| 'neutral'
			| 'accent';
		size?: 'sm' | 'md' | 'lg';
		class?: string;
		disabled?: boolean;
		onclick?: () => void;
	}

	let {
		label = 'Clear',
		variant = 'outline',
		size = 'sm',
		class: additionalClasses = '',
		disabled = false,
		onclick
	}: Props = $props();

	const variantCls = $derived(`btn-${variant}`);
	const sizeCls = $derived(size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : 'btn-md');
</script>

<button type="button" class="btn {variantCls} {sizeCls} {additionalClasses}" {disabled} {onclick}>
	{label}
</button>
