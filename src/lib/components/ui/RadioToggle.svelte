<script lang="ts">
	interface Props {
		/** Bound boolean: false = first option, true = second option */
		value: boolean;
		/** Label for the false state */
		labelFalse: string;
		/** Label for the true state */
		labelTrue: string;
		/** Optional prefix label rendered before the toggle */
		label?: string;
		/** name attribute for the radio group (for accessibility) */
		name?: string;
	}

	let {
		value = $bindable(),
		labelFalse,
		labelTrue,
		label,
		name = 'radio-toggle'
	}: Props = $props();
</script>

<div class="flex items-center gap-3">
	{#if label}
		<span class="text-xs font-semibold tracking-wide uppercase">{label}</span>
	{/if}
	<div class="join">
		<label class="join-item btn btn-sm {!value ? 'btn-neutral' : 'btn-outline bg-base-100'}">
			<input
				type="radio"
				{name}
				class="sr-only"
				checked={!value}
				onchange={() => (value = false)}
			/>
			{labelFalse}
		</label>
		<label class="join-item btn btn-sm {value ? 'btn-neutral' : 'btn-outline bg-base-100'}">
			<input type="radio" {name} class="sr-only" checked={value} onchange={() => (value = true)} />
			{labelTrue}
		</label>
	</div>
</div>
