<script lang="ts">
	interface Props {
		activeSection: string;
	}

	let { activeSection }: Props = $props();

	const tabs = [
		{ id: 'overview', label: 'Overview' },
		{ id: 'systems', label: 'Systems' },
		{ id: 'spotlight', label: 'Spotlight' },
		{ id: 'metrics', label: 'Metrics' },
		{ id: 'coverage', label: 'Data Coverage' },
		{ id: 'export', label: 'Export' }
	] as const;
</script>

<nav
	aria-label="Explore sections"
	class="flex items-center gap-1 overflow-x-auto"
	style="scrollbar-width: none"
>
	{#each tabs as tab (tab.id)}
		<a
			href="#{tab.id}"
			class={[
				'rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors duration-150',
				activeSection === tab.id
					? 'bg-primary text-primary-content'
					: 'text-base-content hover:bg-base-200 hover:text-base-content'
			].join(' ')}
			aria-current={activeSection === tab.id ? 'location' : undefined}
		>
			{tab.label}
		</a>
	{/each}
</nav>

<p class="text-base-content/75 mt-1 mb-1 text-center text-xs md:hidden">
	Swipe to see all sections →
</p>
