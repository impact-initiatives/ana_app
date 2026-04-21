<script lang="ts">
	import NavButton from '$lib/components/ui/NavButton.svelte';
	import { resolve } from '$app/paths';

	interface Props {
		/** Title string */
		title?: string;
		/** Subtitle string */
		subtitle?: string;
		/** Navbutton string */
		navButtonText?: string;
	}
	let {
		title = 'No data loaded',
		subtitle = 'Upload and validate a CSV file on the Home page to start exploring results here.',
		navButtonText = 'Go to Home'
	}: Props = $props();
</script>

<div class="flex flex-col items-center justify-center gap-5 py-14 text-center">
	<!-- Upload icon — neutral, not alarming -->
	<div class="bg-base-200 rounded-full p-5">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="text-primary size-10"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
			<polyline points="17 8 12 3 7 8" />
			<line x1="12" y1="3" x2="12" y2="15" />
		</svg>
	</div>

	<div class="max-w-md">
		<h2 class="mb-4 text-2xl font-semibold">{title}</h2>
		<p class="text-base-content/85 mb-4">{subtitle}</p>
	</div>

	<NavButton
		href={resolve('/')}
		label={navButtonText}
		direction="back"
		variant="primary"
		size="md"
	/>
</div>
