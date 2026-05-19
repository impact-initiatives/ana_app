<script lang="ts">
	interface Option {
		value: string;
		label: string;
	}

	interface OptionGroup {
		group: string;
		options: Option[];
	}

	// Exported so callers can type grouped option arrays without re-declaring.
	export type SelectGroup = OptionGroup;

	interface Props {
		/** Flat options list OR an array of named groups. Groups render with a header divider. */
		options: Option[] | OptionGroup[];
		/**
		 * Current selection.
		 * - Pass a string for simple (single-choice) mode.
		 * - Pass a string[] for multiple (multi-choice) mode.
		 * - Pass null (with multiple=true) to mean "all selected" — shows "All (N)" label.
		 */
		selected: string | string[] | null;
		/** Placeholder text shown when nothing is selected. */
		placeholder?: string;
		/** Optional label rendered above or to the left of the trigger button. */
		label?: string;
		/** Where to render the label relative to the trigger. @default 'top' */
		labelPosition?: 'top' | 'left';
		/** Called with the new string (simple) or string[] (multiple) when the selection changes. */
		onchange?: (selected: string | string[]) => void;
		/** Single mode only: auto-select the first option when nothing is selected. */
		autoSelectFirst?: boolean;
		/** Extra classes for the dropdown panel — use to override the default width (e.g. `"w-full"` in a narrow sidebar). */
		dropdownClass?: string;
		/** Extra classes applied to the root container div (e.g. `"w-60"` to constrain trigger + dropdown width). */
		class?: string;
		/** Unit label used in the "all selected" / compact display, e.g. "UoAs" → "All UoAs (5)" / "UoAs ×3". Omit to fall back to label prop or bare count. */
		unitLabel?: string;
		/** Explicitly enable multi-select mode — required when passing selected=null (all) so mode can be inferred. */
		multiple?: boolean;
		/** How selected items are shown in the trigger. 'chips' shows individual removable chips; 'compact' shows a filled button with a count summary. @default 'chips' */
		displayMode?: 'chips' | 'compact';
	}

	let {
		options,
		selected,
		placeholder = 'Select…',
		label,
		labelPosition = 'top',
		onchange,
		autoSelectFirst = false,
		dropdownClass = 'w-72',
		class: className = '',
		unitLabel = '',
		multiple,
		displayMode = 'chips'
	}: Props = $props();

	const isCompact = $derived(displayMode === 'compact');
	const isLeftLabel = $derived(labelPosition === 'left');

	// isMultiple: explicit prop OR inferred from array type. isNullAll: null passed in multi-mode = "all selected".
	const isMultiple = $derived(multiple === true || Array.isArray(selected));
	const isNullAll = $derived(selected === null && isMultiple);
	const singleVal = $derived(isMultiple ? '' : ((selected as string) ?? ''));
	const multiVal = $derived(!isMultiple ? [] : selected === null ? [] : (selected as string[]));

	// ── Local UI state ────────────────────────────────────────────────────────
	let open = $state(false);
	let searchQuery = $state('');
	let containerEl: HTMLDivElement | undefined = $state();
	let searchInputEl: HTMLInputElement | undefined = $state();

	$effect(() => {
		if (open) searchInputEl?.focus();
	});

	// ── Normalize flat/grouped options ────────────────────────────────────────

	function isGrouped(opts: Option[] | OptionGroup[]): opts is OptionGroup[] {
		return opts.length > 0 && 'group' in opts[0];
	}

	const groups = $derived(
		isGrouped(options) ? options : [{ group: '', options: options as Option[] }]
	);

	const flatOptions = $derived(groups.flatMap((g) => g.options));

	$effect(() => {
		if (autoSelectFirst && !isMultiple && singleVal === '' && flatOptions.length > 0) {
			onchange?.(flatOptions[0].value);
		}
	});

	// ── Derived ───────────────────────────────────────────────────────────────

	const filteredGroups = $derived(
		groups
			.map((g) => ({
				...g,
				options: g.options.filter((o) => o.label.toLowerCase().includes(searchQuery.toLowerCase()))
			}))
			.filter((g) => g.options.length > 0)
	);

	const filtered = $derived(filteredGroups.flatMap((g) => g.options));

	const selectedLabel = $derived(flatOptions.find((o) => o.value === singleVal)?.label ?? null);
	const allSelected = $derived(isNullAll || multiVal.length === flatOptions.length);
	const noneSelected = $derived(!isNullAll && multiVal.length === 0);
	// hasActiveSelection: true for a *partial* selection — drives compact fill. isNullAll (all) treated as unfiltered/neutral.
	const hasActiveSelection = $derived(isMultiple ? multiVal.length > 0 : singleVal !== '');
	const compactPrefix = $derived(unitLabel || label || '');

	function labelFor(v: string): string {
		return flatOptions.find((o) => o.value === v)?.label ?? v;
	}

	// ── Helpers ───────────────────────────────────────────────────────────────

	function closeDropdown() {
		open = false;
		searchQuery = '';
	}

	function selectOne(v: string) {
		closeDropdown();
		onchange?.(v);
	}

	function toggle(v: string) {
		if (isNullAll) {
			onchange?.(flatOptions.map((o) => o.value).filter((s) => s !== v));
			return;
		}
		const next = multiVal.includes(v) ? multiVal.filter((s) => s !== v) : [...multiVal, v];
		onchange?.(next);
	}

	function selectAll() {
		onchange?.(flatOptions.map((o) => o.value));
	}

	function deselectAll() {
		onchange?.([]);
	}

	function removeChip(v: string) {
		const next = multiVal.filter((s) => s !== v);
		onchange?.(next.length === 0 ? flatOptions.map((o) => o.value) : next);
	}

	function onSearchEnter() {
		if (filtered.length === 0) return;
		if (!isMultiple) {
			selectOne(filtered[0].value);
		} else {
			onchange?.(filtered.map((o) => o.value));
			searchQuery = '';
		}
	}

	import Search from './Search.svelte';

	// ── Outside click ─────────────────────────────────────────────────────────

	function onWindowClick(e: MouseEvent) {
		if (containerEl && !containerEl.contains(e.target as Node)) {
			closeDropdown();
		}
	}
</script>

<svelte:window onclick={onWindowClick} />

<div
	class={[isLeftLabel ? 'flex flex-row items-center gap-2' : 'flex flex-col gap-1', className]}
	bind:this={containerEl}
>
	{#if label}
		<span
			class={['text-xs font-semibold tracking-wide uppercase', isLeftLabel ? 'shrink-0' : 'mt-2']}
			>{label}</span
		>
	{/if}
	<!-- Inner wrapper: relative anchor for dropdown, flex-1 when left-label so trigger fills space -->
	<div class={['relative', isLeftLabel ? 'flex-1' : '']}>
		<!-- Trigger -->
		<button
			type="button"
			class={[
				'btn btn-sm h-auto min-h-8 w-full justify-between border py-1.5',
				isCompact && hasActiveSelection ? 'btn-primary' : 'btn-outline border-base-content/50'
			]}
			onclick={() => (open = !open)}
		>
			<span class="flex flex-wrap gap-1">
				{#if !isMultiple}
					{#if selectedLabel === null || singleVal === ''}
						<span class="text-base-content/75">{placeholder}</span>
					{:else}
						<span class="text-base-content">{selectedLabel}</span>
					{/if}
				{:else if isCompact}
					{#if isNullAll}
						<span>All{compactPrefix ? ` ${compactPrefix}` : ''}</span>
					{:else if multiVal.length === 0}
						<span class="text-base-content/75 italic">{placeholder}</span>
					{:else}
						<span
							>{compactPrefix
								? `${compactPrefix} ×${multiVal.length}`
								: `×${multiVal.length}`}</span
						>
					{/if}
				{:else if isNullAll}
					<span class="text-base-content/85"
						>All{unitLabel ? ` ${unitLabel}` : ''} ({flatOptions.length > 1000
							? '1000+'
							: flatOptions.length})</span
					>
				{:else if multiVal.length === 0}
					<span class="text-base-content/75 italic">None selected</span>
				{:else}
					{#each multiVal.slice(0, 3) as v (v)}
						<span class="badge badge-xs badge-primary badge-soft gap-0.5">
							{labelFor(v)}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<span
								class="text-base-content/75 hover:text-base-content cursor-pointer"
								onclick={(e) => {
									e.stopPropagation();
									removeChip(v);
								}}>×</span
							>
						</span>
					{/each}
					{#if multiVal.length > 3}
						<span class="badge badge-ghost badge-xs">+{multiVal.length - 3} more</span>
					{/if}
				{/if}
			</span>

			<!-- Caret -->
			<svg
				class={[
					'h-4 w-4 shrink-0 transition-transform',
					open ? 'rotate-180' : '',
					isCompact && hasActiveSelection ? '' : 'text-base-content/85'
				]}
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
			</svg>
		</button>

		<!-- Dropdown -->
		{#if open}
			<div
				class={[
					'menu rounded-box border-base-300 bg-base-100 absolute top-full z-50 mt-1 border p-0',
					dropdownClass
				]}
			>
				<!-- Search (shared) -->
				<div class="border-base-200 border-b p-2">
					<Search
						bind:value={searchQuery}
						bind:inputEl={searchInputEl}
						extraClass="w-full text-xs"
						onkeydown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								onSearchEnter();
							}
						}}
					/>
				</div>

				<!-- Single mode clear -->
				{#if !isMultiple && singleVal !== ''}
					<div class="border-base-200 border-b px-3 py-1.5">
						<button
							type="button"
							class="btn btn-ghost btn-xs text-base-content/85 text-xs"
							onclick={() => { onchange?.(''); closeDropdown(); }}>Clear</button>
					</div>
				{/if}

				<!-- Multiple mode toolbar -->
				{#if isMultiple}
					<div class="border-base-200 flex flex-wrap items-center gap-2 border-b px-3 py-1.5">
						<button
							type="button"
							class="btn btn-ghost btn-xs text-base-content/85 disabled:text-base-content/40 text-xs"
							disabled={allSelected}
							onclick={selectAll}>Select all</button
						>
						<span class="text-base-content/30">|</span>
						<button
							type="button"
							class="btn btn-ghost btn-xs text-base-content/85 disabled:text-base-content/40 text-xs"
							disabled={noneSelected}
							onclick={deselectAll}>Deselect all</button
						>
						<span class="text-base-content/75 ml-auto shrink-0 text-xs">
							{multiVal.length}/{flatOptions.length}
						</span>
					</div>
				{/if}

				<!-- Options list -->
				<ul class="max-h-56 overflow-y-auto py-1" role="listbox" aria-multiselectable={isMultiple}>
					{#each filteredGroups as grp, i (grp.group || i)}
						{#if grp.group}
							<li
								class="text-base-content/75 px-3 pt-1 pb-0.5 text-[11px] font-semibold tracking-wider uppercase {i >
								0
									? 'border-base-200 mt-1 border-t'
									: ''}"
								role="presentation"
							>
								{grp.group}
							</li>
						{/if}
						{#each grp.options as option (option.value)}
							{@const isSelected = isMultiple
								? isNullAll || multiVal.includes(option.value)
								: option.value === singleVal}
							<li role="option" aria-selected={isSelected}>
								<button
									type="button"
									class="flex w-full items-center gap-2 px-3 py-1.5 text-xs
									{isSelected ? 'text-primary font-medium' : 'text-base-content'} hover:bg-base-200"
									onclick={() => (isMultiple ? toggle(option.value) : selectOne(option.value))}
								>
									{#if isMultiple}
										<input
											type="checkbox"
											class="checkbox checkbox-primary checkbox-xs pointer-events-none shrink-0"
											checked={isSelected}
											tabindex="-1"
											readonly
										/>
									{:else}
										<input
											type="radio"
											class="radio radio-primary radio-xs pointer-events-none shrink-0"
											checked={isSelected}
											tabindex="-1"
											readonly
										/>
									{/if}
									{option.label}
								</button>
							</li>
						{/each}
					{:else}
						<li class="text-base-content/75 px-3 py-2 text-xs">No matches</li>
					{/each}
				</ul>
			</div>
		{/if}
	</div>
</div>
