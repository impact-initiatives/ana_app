<script lang="ts">
	import { themeStore } from '$lib/stores/themeStore.svelte';
</script>

<!--
  swap-rotate drives the sun/moon animation via checkbox checked state.
  No theme-controller class — we set data-theme explicitly in themeStore.toggle().
  Input is sr-only so it doesn't show browser default checkbox styling.
-->
<label
	class="swap swap-rotate btn btn-ghost btn-sm btn-circle hover:bg-base-300"
	title={themeStore.isDark ? 'Switch to light mode' : 'Switch to dark mode'}
	aria-label={themeStore.isDark ? 'Switch to light mode' : 'Switch to dark mode'}
>
	<input type="checkbox" checked={themeStore.isDark} onchange={() => themeStore.toggle()} class="sr-only" />

	<!-- Sun — shown when light mode (swap-off = unchecked) -->
	<svg
		class="swap-off size-4"
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<circle cx="12" cy="12" r="4" />
		<path
			d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
		/>
	</svg>

	<!-- Moon — shown when dark mode (swap-on = checked) -->
	<svg
		class="swap-on size-4"
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
	</svg>
</label>
