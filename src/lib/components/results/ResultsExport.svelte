<script lang="ts">
	import Card from '$lib/components/ui/Card.svelte';
	import DownloadButton from '$lib/components/ui/DownloadButton.svelte';

	type Row = Record<string, any>;

	interface Props {
		rows: Row[];
		handleJSON: () => void;
		handleCSV: () => void;
		handleXLSX: () => void;
		handleDeepDive: () => Promise<void>;
	}

	let {
		rows,
		handleJSON,
		handleCSV,
		handleXLSX,
		handleDeepDive
	}: Props = $props();
</script>

<section class="min-h-screen">
	<h1 class="border-primary mb-8 border-l-6 pl-3 text-2xl font-semibold tracking-widest uppercase">
		Export
	</h1>

	<div class="space-y-6">
		<!-- Stat bar -->
		<div
			class="bg-base-200/60 border-base-300 rounded-box flex items-center gap-3 border px-5 py-3"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="text-success size-5 shrink-0"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
			</svg>
			<p class="text-sm">
				<strong>{rows.length}</strong> unit{rows.length !== 1 ? 's' : ''} of analysis ready to export.
			</p>
		</div>

		<!-- Flat exports -->
		<div>
			<p class="text-base-content/85 mb-3 font-semibold uppercase">Export dataset</p>
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
				<button
					class="group border-base-300 hover:border-primary hover:bg-primary/5 rounded-box flex cursor-pointer items-start gap-4 border px-5 py-4 text-left transition-colors duration-150"
					onclick={handleJSON}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="group-hover:text-primary mt-0.5 size-7 shrink-0 transition-colors duration-150"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline
							points="14 2 14 8 20 8"
						/>
						<line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
					</svg>
					<div>
						<p class="text-sm font-semibold">JSON</p>
						<p class="text-base-content/85 mt-0.5 text-sm">
							Nested hierarchical format. Ideal for programmatic use.
						</p>
					</div>
				</button>

				<button
					class="group border-base-300 hover:border-primary hover:bg-primary/5 rounded-box flex cursor-pointer items-start gap-4 border px-5 py-4 text-left transition-colors duration-150"
					onclick={handleCSV}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-base-content/85 group-hover:text-primary mt-0.5 size-7 shrink-0 transition-colors duration-150"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<rect x="3" y="3" width="18" height="18" rx="2" />
						<line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" />
						<line x1="9" y1="3" x2="9" y2="21" />
					</svg>
					<div>
						<p class="text-sm font-semibold">CSV</p>
						<p class="text-base-content/85 mt-0.5 text-sm">
							Flat tabular. One row per UoA. Compatible with Excel, R, Python.
						</p>
					</div>
				</button>

				<button
					class="group border-base-300 hover:border-primary hover:bg-primary/5 rounded-box flex cursor-pointer items-start gap-4 border px-5 py-4 text-left transition-colors duration-150"
					onclick={handleXLSX}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-base-content/85 group-hover:text-primary mt-0.5 size-7 shrink-0 transition-colors duration-150"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline
							points="14 2 14 8 20 8"
						/>
						<path d="M8 13l2 2 4-4" />
					</svg>
					<div>
						<p class="text-sm font-semibold">Excel (XLSX)</p>
						<p class="text-base-content/85 mt-0.5 text-sm">
							Native workbook. Useful for sharing with non-technical audiences.
						</p>
					</div>
				</button>
			</div>
		</div>

		<!-- Deep dives -->
		<div>
			<p class="text-base-content/85 mb-3 font-semibold uppercase">Deep-dive workbooks</p>
			<Card
				title="Pre-populated XLSX per unit of analysis"
				titleSemibold
				titleUppercase
				titleSize="text-sm"
			>
				<div>
					<p class="text-base-content/85 text-sm">
						One workbook per selected UoA, pre-filled with metric values and preliminary flags.
						Delivered as a single ZIP archive.
					</p>
				</div>
				<div class="flex flex-wrap items-center gap-4">
					<DownloadButton
						onclick={handleDeepDive}
						label="Download ZIP"
						variant="secondary"
						size="md"
						disabled={rows.length === 0}
					></DownloadButton>
					<p class="text-base-content/75 text-sm">
						Workbooks will be generated for the <strong>{rows.length}</strong>
						UoA{rows.length !== 1 ? 's' : ''} matching your current filters.
					</p>
				</div>
			</Card>
		</div>
	</div>
</section>
