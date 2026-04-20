<script lang="ts">
	import { resolve } from '$app/paths';
	import ValidatorView from '$lib/components/data/ValidatorView.svelte';
	import NavButton from '$lib/components/ui/NavButton.svelte';
	import { validatorStore } from '$lib/stores/validatorStore.svelte';
	import type { ValidationResult } from '$lib/engine/validator';
	import Card from '$lib/components/ui/Card.svelte';
</script>

<svelte:head>
	<title>ANA — Validation details</title>
</svelte:head>

<div class="mx-auto max-w-5xl px-4">
	<div class="mb-6 flex items-center gap-4">
		<NavButton href={resolve('/')} label="Upload" direction="back" size="sm" />
		<div class="flex items-baseline gap-2">
			<h1 class="text-lg font-bold">Validation details</h1>
			{#if validatorStore.filename}
				<span class="text-base-content/40 text-sm">{validatorStore.filename}</span>
			{/if}
		</div>
	</div>

	{#if validatorStore.validationResult}
		<ValidatorView
			result={validatorStore.validationResult as unknown as ValidationResult | null}
			header={validatorStore.lastHeader ?? []}
			rows={validatorStore.lastRows ?? []}
			loading={false}
		/>
	{:else}
		<Card bodyClass="items-center py-16 text-center">
			<p class="text-base-content/50 text-sm">No validation result yet.</p>
			<a href={resolve('/')} class="btn btn-primary btn-sm mt-4 cursor-pointer"> Upload a file </a>
		</Card>
	{/if}
</div>
