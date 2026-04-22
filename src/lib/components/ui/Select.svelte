<script lang="ts">
	// Options
	// Type definitions for the options passed to the select component.
	interface Option {
		value: string;
		label: string;
	}

	// Props for the select component.
	interface Props {
		/** The list of options to display. */
		options: Option[];
		/**
		 * Current selection.
		 * - Pass a string for simple (single-choice) mode.
		 * - Pass a string[] for multiple (multi-choice) mode.
		 * Mode is inferred automatically from the type — no extra prop needed.
		 */
		selected: string | string[];
		/** Placeholder text shown when nothing is selected. */
		placeholder?: string;
		/** Optional label rendered above the trigger button. */
		label?: string;
		/** Called with the new string (simple) or string[] (multiple) when the selection changes. */
		onchange?: (selected: string | string[]) => void;
	}

	// Those props are passed in from the parent component.
	// These are the component's parameters that are used from the parent component.
	let { options, selected, placeholder = 'Select…', label, onchange }: Props = $props();

	// Mode derived from the shape of selected — no separate prop needed.
	const isMultiple = $derived(Array.isArray(selected));
	const singleVal = $derived(isMultiple ? '' : (selected as string));
	const multiVal = $derived(isMultiple ? (selected as string[]) : []);

	// ── Local UI state ────────────────────────────────────────────────────────
	// Whether the dropdown panel is currently visible.
	let open = $state(false);
	// The current text typed into the search box; used to filter the options list.
	let searchQuery = $state('');
	// A reference to this component's root <div> in the DOM.
	// Used by the window click handler to detect clicks *outside* the component
	// so the dropdown can be closed when the user clicks elsewhere on the page.
	let containerEl: HTMLDivElement | undefined = $state();

	// ── Derived ───────────────────────────────────────────────────────────────

	// The subset of options whose label contains the current search text.
	// Recomputes on every keystroke so the list updates in real time.
	const filtered = $derived(
		options.filter((o) => o.label.toLowerCase().includes(searchQuery.toLowerCase()))
	);

	// Simple mode: the display label for the currently selected value,
	// or null when nothing is selected (so the placeholder is shown instead).
	const selectedLabel = $derived(options.find((o) => o.value === singleVal)?.label ?? null);

	// Multiple mode: convenience flags used to enable/disable the
	// "Select all" and "Clear" toolbar buttons respectively.
	const allSelected = $derived(multiVal.length === options.length);
	const noneSelected = $derived(multiVal.length === 0);

	/** Returns the label for a given value v
	 *  falling back to the value itself if no label is found.
	 */
	function labelFor(v: string): string {
		return options.find((o) => o.value === v)?.label ?? v;
	}

	// ── Helpers ───────────────────────────────────────────────────────────────

	/**
	 * Closes the dropdown panel and clears the search query.
	 */
	function closeDropdown() {
		open = false;
		searchQuery = '';
	}

	/**
	 * Selects a single value and closes the dropdown.
	 */
	function selectOne(v: string) {
		closeDropdown();
		onchange?.(v);
	}

	/**
	 * Clears the current selection and closes the dropdown.
	 */
	function clearOne() {
		closeDropdown();
		onchange?.('');
	}

	/**
	 * Toggles the selection of a value (multiple mode only).
	 * It removes the value if it's already selected, or adds it if not.
	 */
	function toggle(v: string) {
		const next = multiVal.includes(v) ? multiVal.filter((s) => s !== v) : [...multiVal, v];
		onchange?.(next);
	}

	/**
	 * Selects all values and closes the dropdown.
	 */
	function selectAll() {
		onchange?.(options.map((o) => o.value));
	}

	/**
	 * Clears all selected values and closes the dropdown.
	 */
	function clearAll() {
		onchange?.([]);
	}

	/**
	 * Removes a chip (value) from the selection and closes the dropdown.
	 * This is used when a user clicks on a chip to remove it from the selection.
	 */
	function removeChip(v: string) {
		onchange?.(multiVal.filter((s) => s !== v));
	}

	// ── Outside click ─────────────────────────────────────────────────────────

	/**
	 * Closes the dropdown when the user clicks outside the component.
	 */
	function onWindowClick(e: MouseEvent) {
		if (containerEl && !containerEl.contains(e.target as Node)) {
			closeDropdown();
		}
	}
</script>

<!-- Every click on the page bubbles up to window and fires onWindowClick.
     That function checks if the click landed inside containerEl (this component's root div).
     If outside → close the dropdown. If inside → do nothing, letting the trigger handle it. -->
<svelte:window onclick={onWindowClick} />

<!--
  UI structure
  ├── Label (optional, shown above trigger)
  ├── Trigger (button, full width)
  │   ├── Simple mode
  │   │   ├── Placeholder (when nothing selected)
  │   │   └── Badge chip with × (when a value is selected)
  │   ├── Multiple mode
  │   │   ├── Placeholder (when nothing selected)
  │   │   ├── "All (n)" label (when everything selected)
  │   │   └── Up to 3 badge chips with ×, then "+n more" overflow badge
  │   └── Caret icon (rotates when open)
  └── Dropdown (visible when open)
      ├── Search input (filters the options list in real time)
      ├── Toolbar — multiple mode
      │   ├── "Select all" button (disabled when all selected)
      │   ├── "Clear" button (disabled when none selected)
      │   └── "n/total" counter
      ├── Toolbar — single mode (only when a value is selected)
      │   └── "Clear" button
      └── Options list
          ├── Each option row (button)
          │   ├── Checkbox (multiple mode) or Radio (simple mode)
          │   └── Option label
          └── "No matches" message (when search has no results)
-->

<div class="flex flex-col gap-1" bind:this={containerEl}>
	<!-- If label is provided, render it above the trigger button. -->
	{#if label}
		<span class="mt-2 text-xs font-semibold tracking-wide uppercase">{label}</span>
	{/if}
	<!-- Trigger -->
	<button
		type="button"
		class="btn btn-outline border-base-content/30 btn-sm h-auto min-h-8 justify-between border py-1.5"
		onclick={() => (open = !open)}
	>
		<span class="flex flex-wrap gap-1">
			{#if !isMultiple}
				<!-- Simple mode: just text, no badge, no clear -->
				{#if selectedLabel === null || singleVal === ''}
					<span class="text-base-content">{placeholder}</span>
				{:else}
					<span class="text-base-content">{selectedLabel}</span>
				{/if}
			{:else}
				<!-- Multiple mode: placeholder / "All (n)" / up-to-3 chips + overflow -->
				{#if multiVal.length === 0}
					<span class="text-base-content/70">{placeholder}</span>
				{:else if multiVal.length === options.length}
					<span class="text-base-content/70">All ({options.length})</span>
				{:else}
					{#each multiVal.slice(0, 3) as v (v)}
						<span class="badge badge-xs badge-primary badge-soft gap-0.5">
							{labelFor(v)}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<span
								class="cursor-pointer opacity-60 hover:opacity-100"
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
			{/if}
		</span>

		<!-- Caret -->
		<svg
			class="text-base-content/70 h-4 w-4 shrink-0 transition-transform {open ? 'rotate-180' : ''}"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
		</svg>
	</button>

	<!-- Dropdown -->
	{#if open}
		<div class="menu rounded-box border-base-300 bg-base-100 absolute z-50 mt-10 w-72 border p-0">
			<!-- Search (shared) -->
			<div class="border-base-200 border-b p-2">
				<input
					type="text"
					class="input input-sm bg-base-100 w-full border text-xs"
					placeholder="Search…"
					bind:value={searchQuery}
					onclick={(e) => e.stopPropagation()}
				/>
			</div>

			<!-- Single mode: no clear toolbar -->

			<!-- Multiple mode only: select-all / clear toolbar -->
			{#if isMultiple}
				<div class="border-base-200 flex items-center gap-2 border-b px-3 py-1.5">
					<button
						type="button"
						class="btn btn-soft btn-xs text-primary text-xs disabled:opacity-40"
						disabled={allSelected}
						onclick={selectAll}>Select all</button
					>
					<span class="text-primary">|</span>
					<button
						type="button"
						class="btn btn-ghost btn-xs text-base-content/70 text-xs disabled:opacity-40"
						disabled={noneSelected}
						onclick={clearAll}>Clear</button
					>
					<span class="ml-auto text-xs opacity-50">
						{multiVal.length}/{options.length}
					</span>
				</div>
			{/if}

			<!-- Options list -->
			<ul class="max-h-56 overflow-y-auto py-1" role="listbox" aria-multiselectable={isMultiple}>
				{#each filtered as option (option.value)}
					{@const isSelected = isMultiple
						? multiVal.includes(option.value)
						: option.value === singleVal}
					<li role="option" aria-selected={isSelected}>
						<button
							type="button"
							class="flex w-full items-center gap-2 px-3 py-1.5 text-xs
								{isSelected ? 'text-primary font-medium' : 'text-base-content'} hover:bg-base-200"
							onclick={() => (isMultiple ? toggle(option.value) : selectOne(option.value))}
						>
							{#if isMultiple}
								<!-- Multiple mode: real checkbox, pointer-events-none so the parent button handles the click -->
								<input
									type="checkbox"
									class="checkbox checkbox-primary checkbox-xs pointer-events-none shrink-0"
									checked={isSelected}
									tabindex="-1"
									readonly
								/>
							{:else}
								<!-- Simple mode: real radio, pointer-events-none so the parent button handles the click -->
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
				{:else}
					<li class="text-base-content/70 px-3 py-2 text-xs">No matches</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
