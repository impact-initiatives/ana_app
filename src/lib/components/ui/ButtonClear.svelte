<script lang="ts">
	interface Props {
		label?: string;
		size?: 'xs' | 'sm' | 'md';
		/** Full Tailwind width classes, e.g. 'min-w-16 max-w-32'. */
		widthClass?: string;
		onclick?: () => void;
	}

	let { label = 'Clear', size = 'sm', widthClass = 'w-30', onclick }: Props = $props();
</script>

<button type="button" class={['btn btn-outline bg-base-100', `btn-${size}`, widthClass]} {onclick}
	>{label}</button
>
