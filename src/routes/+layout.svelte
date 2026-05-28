<script lang="ts">
	import './layout.css';
	import logo from '$lib/assets/LogoANA2026.svg';
	import logoDark from '$lib/assets/LogoANA2026-dark.svg';
	import '../app.css';

	import { onMount, tick } from 'svelte';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page, navigating } from '$app/state';
	import { fade } from 'svelte/transition';
	import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';
	import Footer from '$lib/components/ui/Footer.svelte';
	import { flagStore, hydrateFlagStore } from '$lib/stores/flagStore.svelte';
	import { hydrateMetricStore, loadMetrics } from '$lib/stores/metricStore.svelte';
	import { hydrateMetricSourcesStore } from '$lib/stores/metricSourcesStore.svelte';
	import { clearAllStores, clearAllStoresOnFrameworkUpdate } from '$lib/utils/clearAll';
	import exploreNav from '$lib/stores/exploreNav.svelte';
	import { setAppReady } from '$lib/stores/appReady.svelte';

	type AppRoute = Parameters<typeof resolve>[0];

	let { children } = $props();

	onMount(async () => {
		// Hydrate stores from localStorage after first paint so the app-loader
		// spinner is already animating — heavy JSON.parse no longer freezes it.
		hydrateFlagStore();
		hydrateMetricStore();
		hydrateMetricSourcesStore();

		// If reference.json was not in localStorage, fetch it now.
		// Keep the app-loader visible until this resolves.
		const { frameworkUpdated } = await loadMetrics();
		if (frameworkUpdated) {
			clearAllStoresOnFrameworkUpdate();
			await tick();
			showFrameworkModal = true;
		}

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

	const utilityLinks = [
		{ path: '/reference' as const, label: 'Reference' },
		{ path: '/merge' as const, label: 'Merge' }
	];

	let showFrameworkModal = $state(false);
	let scrollY = $state(0);

	function clearAll() {
		clearAllStores();
		goto(resolve('/'));
	}
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
			{#if flagStore.flaggedResult}
				<div class="flex items-center gap-2">
					<a
						href={resolve('/results')}
						class="border-success/30 bg-success/10 text-success hover:bg-success/20 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-150"
					>
						<span class="bg-success inline-block size-1.5 rounded-full"></span>
						Results loaded
					</a>
					<button
						class="border-error/30 bg-error/10 text-error hover:bg-error/20 inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-150"
						onclick={clearAll}
					>
						<span class="bg-error inline-block size-1.5 rounded-full"></span>
						Clear
					</button>
				</div>
			{/if}
		</div>

		<!-- Desktop nav -->
		<nav class="navbar-end hidden items-center gap-0 lg:flex" aria-label="Main navigation">
			<!-- Workflow links -->
			<div class="flex items-stretch">
				{#each workflowLinks as link (link.path)}
					<a
						href={resolve(link.path)}
						class={[
							'relative flex items-center gap-1.5 px-3.5 py-1 text-sm transition-colors duration-150',
							isActive(link.path)
								? 'text-primary after:bg-primary after:absolute after:right-0 after:bottom-0 after:left-0 after:h-0.5 after:rounded-full'
								: 'text-base-content/85 hover:text-base-content'
						].join(' ')}
						aria-current={isActive(link.path) ? 'page' : undefined}
					>
						{#if link.path === '/results'}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="1.5"
								stroke="currentColor"
								class="size-4"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5"
								/>
							</svg>
						{/if}
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
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
						class="size-4"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
						/>
					</svg>

					Export
				</a>

				<!-- Reupload shortcut — only when results are loaded -->
				{#if flagStore.flaggedResult}
					<a
						href="{resolve('/')}#upload"
						class="text-base-content/85 hover:text-base-content relative flex items-center gap-1.5 px-3.5 py-1 text-sm transition-colors duration-150"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="1.5"
							stroke="currentColor"
							class="size-4"
							aria-hidden="true"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
							/>
						</svg>
						Reupload
					</a>
				{/if}
			</div>

			<!-- Divider -->
			<div class="bg-base-300 mx-3 h-5 w-px" aria-hidden="true"></div>

			<!-- Utility links -->
			<div class="flex items-stretch gap-0">
				{#each utilityLinks as link (link.path)}
					<a
						href={resolve(link.path)}
						class={[
							'relative flex items-center gap-1.5 px-3.5 py-1 text-sm transition-colors duration-150',
							isActive(link.path)
								? 'text-primary after:bg-primary after:absolute after:right-0 after:bottom-0 after:left-0 after:h-0.5 after:rounded-full'
								: 'text-base-content/85 hover:text-base-content'
						].join(' ')}
						aria-current={isActive(link.path) ? 'page' : undefined}
					>
						{#if link.path === '/merge'}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="1.5"
								stroke="currentColor"
								class="size-4"
								aria-hidden="true"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25"
								/>
							</svg>
						{:else if link.path === '/reference'}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="1.5"
								stroke="currentColor"
								class="size-4"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
								/>
							</svg>
						{/if}
						{link.label}
					</a>
				{/each}
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
								{#if link.path === '/results'}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										stroke-width="1.5"
										stroke="currentColor"
										class="size-4"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5"
										/>
									</svg>
								{/if}
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
								{#if link.path === '/merge'}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										stroke-width="1.5"
										stroke="currentColor"
										class="size-4"
										aria-hidden="true"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25"
										/>
									</svg>
								{:else if link.path === '/reference'}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										stroke-width="1.5"
										stroke="currentColor"
										class="size-4"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
										/>
									</svg>
								{/if}
								{link.label}
							</a>
						</li>
					{/each}
					<li>
						<a href="{resolve('/results')}#export">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="1.5"
								stroke="currentColor"
								class="size-4"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
								/>
							</svg>

							Export
						</a>
					</li>
					{#if flagStore.flaggedResult}
						<li>
							<a href="{resolve('/')}#upload">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									stroke-width="1.5"
									stroke="currentColor"
									class="size-4"
									aria-hidden="true"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
									/>
								</svg>
								Reupload
							</a>
						</li>
						<li><hr class="border-base-300 my-1" /></li>
						<li>
							<button class="text-error w-full text-left" onclick={clearAll}>Clear all data</button>
						</li>
					{/if}
				</ul>
			</div>
		</div>
	</div>
</header>

<main class="flex min-h-[calc(100vh-3.5rem)] flex-col pt-6">
	<div class="flex-1">
		{@render children?.()}
	</div>
	<Footer />
</main>

<!-- Framework update notification -->
<dialog class={['modal', showFrameworkModal ? 'modal-open' : ''].join(' ')}>
	<div class="modal-box max-w-md">
		<h3 class="text-base-content text-lg font-bold">Framework updated</h3>
		<p class="text-base-content/80 py-3 text-sm">
			The ANA reference framework has been updated. Any stored results or custom reference rows have
			been cleared — please re-upload your CSV to run your analysis.
		</p>
		<div class="modal-action">
			<button class="btn btn-primary btn-sm" onclick={() => (showFrameworkModal = false)}>
				OK, understood
			</button>
		</div>
	</div>
	<div
		class="modal-backdrop"
		role="presentation"
		onclick={() => (showFrameworkModal = false)}
	></div>
</dialog>

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
