<script lang="ts">
	import './layout.css';
	import logo from '$lib/assets/LogoANA2026.svg';
	import logoDark from '$lib/assets/LogoANA2026-dark.svg';
	import '../app.css';

	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { page, navigating } from '$app/state';
	import { fade } from 'svelte/transition';
	import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';
	import Footer from '$lib/components/ui/Footer.svelte';
	import { flagStore } from '$lib/stores/flagStore.svelte';
	import { hydrateFlagStore } from '$lib/stores/flagStore.svelte';
	import { hydrateMetricStore, loadMetrics } from '$lib/stores/metricStore.svelte';
	import exploreNav from '$lib/stores/exploreNav.svelte';
	import { setAppReady } from '$lib/stores/appReady.svelte';

	type AppRoute = Parameters<typeof resolve>[0];

	let { children } = $props();

	onMount(async () => {
		// Hydrate stores from localStorage after first paint so the app-loader
		// spinner is already animating — heavy JSON.parse no longer freezes it.
		hydrateFlagStore();
		hydrateMetricStore();

		// If reference.json was not in localStorage, fetch it now.
		// Keep the app-loader visible until this resolves.
		await loadMetrics();

		// Fade out the app-loader and reveal content simultaneously.
		const loader = document.getElementById('app-loader');
		if (loader) {
			loader.style.opacity = '0';
			loader.addEventListener('transitionend', () => loader.remove(), { once: true });
		}
		setAppReady();
	});

	function isActive(path: AppRoute | string): boolean {
		const routeId = page.route.id ?? '';
		if (path === '/') return routeId === '/' || routeId === '';
		return routeId.startsWith(path);
	}

	function isResultsPage(): boolean {
		return (page.route.id ?? '').startsWith('/results');
	}

	const workflowLinks = [
		{ path: '/' as const, label: 'Home' },
		{ path: '/results' as const, label: 'Results' }
	];

	const utilityLinks = [{ path: '/reference' as const, label: 'Reference' }];

	let scrollY = $state(0);
</script>

<svelte:window bind:scrollY />

<!-- Navigation progress bar: visible during client-side route transitions -->
{#if navigating}
	<div
		class="pointer-events-none fixed top-0 left-0 z-9999 h-1 w-full overflow-hidden"
		out:fade={{ duration: 200 }}
	>
		<div
			class="bg-primary h-full w-full origin-left"
			style="animation: nav-progress 2s ease-out forwards"
		></div>
	</div>
{/if}

<header
	class={[
		'border-base-300 sticky top-0 z-30 border-b transition-shadow duration-200',
		scrollY > 10 ? 'bg-base-100/90 shadow-sm backdrop-blur-sm' : 'bg-base-100'
	].join(' ')}
>
	<div class="navbar mx-auto min-h-14 max-w-7xl px-4">
		<!-- Brand -->
		<div class="navbar-start justify-content space-evenly flex items-center gap-5">
			<a
				href={resolve('/')}
				class="flex items-center gap-2.5"
				aria-label="ANA — Acute Needs Analysis"
			>
				<img src={logo} alt="ANA logo" class="logo-light h-8 w-auto shrink-0" />
				<img src={logoDark} alt="ANA logo" class="logo-dark h-8 w-auto shrink-0" />
				<span class="text-base-content/85 hidden font-semibold sm:inline">Acute Needs Analysis</span
				>
			</a>
			<!-- Data-state dot: visible when analysis results are loaded -->
			{#if flagStore.flaggedResult}
				<div class="flex">
					<div class="inline-grid gap-2 *:[grid-area:1/1]">
						<div class="status status-success animate-ping"></div>
						<div class="status status-success"></div>
					</div>

					<div class="text-success text-sm">Results loaded</div>
				</div>{/if}
		</div>

		<!-- Desktop nav -->
		<nav class="navbar-end hidden items-center gap-0 lg:flex" aria-label="Main navigation">
			<!-- Workflow links -->
			<div class="flex items-stretch">
				{#each workflowLinks as link (link.path)}
					<a
						href={resolve(link.path)}
						class={[
							'relative flex items-center px-3.5 py-1 text-sm transition-colors duration-150',
							isActive(link.path)
								? 'text-primary after:bg-primary after:absolute after:right-0 after:bottom-0 after:left-0 after:h-0.5 after:rounded-full'
								: 'text-base-content/85 hover:text-base-content'
						].join(' ')}
						aria-current={isActive(link.path) ? 'page' : undefined}
					>
						{link.label}
					</a>
				{/each}
			</div>

			<!-- Divider -->
			<div class="bg-base-300 mx-3 h-5 w-px" aria-hidden="true"></div>

			<!-- Utility links -->
			<div class="flex items-stretch gap-0">
				{#each utilityLinks as link (link.path)}
					<a
						href={resolve(link.path)}
						class={[
							'relative flex items-center px-3.5 py-1 text-sm transition-colors duration-150',
							isActive(link.path)
								? 'text-primary after:bg-primary after:absolute after:right-0 after:bottom-0 after:left-0 after:h-0.5 after:rounded-full'
								: 'text-base-content/85 hover:text-base-content'
						].join(' ')}
						aria-current={isActive(link.path) ? 'page' : undefined}
					>
						{link.label}
					</a>
				{/each}

				<!-- Export shortcut — anchor to #export section on /results -->
				<a
					href="{resolve('/results')}#export"
					class={[
						'relative flex items-center gap-1.5 px-3.5 py-1 text-sm transition-colors duration-150',
						isResultsPage() && exploreNav.activeSection === 'export'
							? 'text-primary after:bg-primary after:absolute after:right-0 after:bottom-0 after:left-0 after:h-0.5 after:rounded-full'
							: 'text-base-content/85 hover:text-base-content'
					].join(' ')}
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
					Export
				</a>
			</div>

			<!-- Divider -->
			<div class="bg-base-300 mx-2 h-5 w-px" aria-hidden="true"></div>

			<!-- Theme toggle -->
			<ThemeToggle />
		</nav>

		<!-- Mobile: theme toggle + hamburger -->
		<div class="navbar-end flex items-center gap-1 lg:hidden">
			<ThemeToggle />
			<div class="dropdown dropdown-end">
				<button tabindex="0" aria-label="Open navigation menu" class="btn btn-ghost btn-sm">
					<svg
						aria-hidden="true"
						xmlns="http://www.w3.org/2000/svg"
						class="size-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="1.5"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h8m-8 6h16" />
					</svg>
				</button>
				<ul
					tabindex="-1"
					class="menu menu-sm dropdown-content bg-base-100 border-base-300 rounded-box z-10 mt-2 w-52 border p-2 shadow-md"
				>
					<li class="menu-title text-xs opacity-60">Workflow</li>
					{#each workflowLinks as link (link.path)}
						<li>
							<a
								href={resolve(link.path)}
								class={isActive(link.path) ? 'active' : ''}
								aria-current={isActive(link.path) ? 'page' : undefined}
							>
								{link.label}
							</a>
						</li>
					{/each}
					<li><hr class="border-base-300 my-1" /></li>
					<li class="menu-title text-xs opacity-60">Tools</li>
					{#each utilityLinks as link (link.path)}
						<li>
							<a
								href={resolve(link.path)}
								class={isActive(link.path) ? 'active' : ''}
								aria-current={isActive(link.path) ? 'page' : undefined}
							>
								{link.label}
							</a>
						</li>
					{/each}
					<li>
						<a href="{resolve('/results')}#export">Export</a>
					</li>
				</ul>
			</div>
		</div>
	</div>
</header>

<main class="pt-6">
	{@render children?.()}
</main>

<Footer />

<!-- Back to top -->
{#if scrollY > 400}
	<button
		class="btn btn-sm bg-base-200 border-base-300 hover:border-primary fixed right-5 bottom-5 z-40 cursor-pointer border duration-200"
		onclick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
		aria-label="Back to top"
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
				d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
				clip-rule="evenodd"
			/>
		</svg>
		<span>Back to Top</span>
	</button>
{/if}
