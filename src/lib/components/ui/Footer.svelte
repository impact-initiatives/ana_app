<script lang="ts">
	import { resolve } from '$app/paths';
	import logo from '$lib/assets/LogoANA2026.svg';
	import logoDark from '$lib/assets/LogoANA2026-dark.svg';
	import logo_impact from '$lib/assets/IMPACT.svg';
	import logo_impact_dark from '$lib/assets/IMPACT-dark.svg';

	const navLinks = [
		{ href: resolve('/'), label: 'Home' },
		{ href: resolve('/results'), label: 'Results' },
		{ href: resolve('/reference'), label: 'Reference' },
		{ href: resolve('/merge'), label: 'Merge' },
		{ href: `${resolve('/results')}#export`, label: 'Export' }
	];
</script>

<footer class="border-base-300 bg-base-200 border-t">
	<div class="mx-auto max-w-7xl px-4 py-10">
		<div class="text-base-content/85 grid grid-cols-1 gap-10 sm:grid-cols-3">
			<!-- Brand -->
			<div class="flex flex-col gap-3">
				<a href={resolve('/')} class="flex items-center gap-2.5" aria-label="ANA home">
					<img src={logo} alt="ANA logo" class="logo-light h-24 w-auto" />
					<img src={logoDark} alt="ANA logo" class="logo-dark h-24 w-auto" />
				</a>
				<p class="max-w-xs text-sm leading-relaxed">
					Acute Needs Analysis — screen humanitarian data for risk of excess mortality.
				</p>
			</div>

			<!-- Navigation -->
			<nav aria-label="Footer navigation">
				<p class="mb-3 text-xs font-semibold tracking-widest uppercase">Navigation</p>
				<ul class="space-y-2">
					{#each navLinks as link (link.href)}
						<li>
							<a
								href={link.href}
								class="text-base-content/70 hover:text-primary text-sm transition-colors duration-150"
							>
								{link.label}
							</a>
						</li>
					{/each}
				</ul>
			</nav>

			<!-- Partner logos -->
			<div class="flex flex-col gap-3">
				<p class="mb-1 text-xs font-semibold tracking-widest uppercase">Who we are</p>
				<p class="mb-2 text-sm">
					The world’s largest independent data provider in crisis contexts.
				</p>
				<div class="flex flex-wrap items-center gap-4">
					<a
						href="https://www.impact-initiatives.org/"
						target="_blank"
						rel="noopener noreferrer"
						aria-label="IMPACT Initiatives"
					>
						<img src={logo_impact} alt="Impact" class="logo-light h-12 w-auto" />
						<img src={logo_impact_dark} alt="Impact" class="logo-dark h-12 w-auto" />
					</a>
				</div>
			</div>
		</div>
	</div>
</footer>
