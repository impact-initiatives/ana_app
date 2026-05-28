<script lang="ts">
	import { asset, resolve } from '$app/paths';
	import Uploader, { type ProcessResult } from '$lib/components/data/Uploader.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import InfoButton from '$lib/components/ui/InfoButton.svelte';
	import InfoModal, { type InfoItem } from '$lib/components/ui/InfoModal.svelte';
	import { metricStore } from '$lib/stores/metricStore.svelte';
	import { saveValidatorState } from '$lib/stores/validatorStore.svelte';
	import { clearAllStores } from '$lib/utils/clearAll';
	import { validateCsv } from '$lib/engine/dataValidator';
	import { parseFile } from '$lib/engine/parser';
	import { runPipeline } from '$lib/engine/pipeline';

	let {
		onaccepted,
		onprocessstart,
		oncleared
	}: { onaccepted?: () => void; onprocessstart?: () => void; oncleared?: () => void } = $props();

	const metricMap = $derived(metricStore.metricMap);

	let showFormatModal = $state(false);

	const infoModalItemsInputData = [
		{
			id: 'uoa-column',
			title: 'uoa column',
			badgeType: 'required',
			content: [
				'A column named exactly uoa which is a unique identifier for rows such as p-code, district name, or any string that identifies the unit of analysis (UoA).',
				'If uoa values are valid admin p-codes (e.g. SOM001), a choropleth map is generated automatically.'
			]
		},
		{
			id: 'metric-columns',
			title: 'Metric columns',
			badgeType: 'required',
			content:
				'Named with the metric ID (e.g. MET001, MET002). Unrecognised column names are silently ignored during flagging.'
		},
		{
			id: 'metadata-columns',
			title: 'Metadata columns',
			badgeType: 'optional',
			content: [
				'Extra columns like admin 1 are carried through and available as filters in results views. If values are p-codes, filter labels are resolved to their admin names automatically.'
			]
		},
		{
			id: 'values',
			title: 'Values',
			badgeType: 'info',
			content:
				'Must be generally numeric or empty. No formatted strings, units, or special characters. For missing values, leave the cell empty.'
		}
	] satisfies InfoItem[];

	const infoModalTopInputData = {
		messagePrefix: 'Download the CSV',
		href: asset('/data/input_template.csv'),
		text: 'template',
		suffix: '. And read the below for information on how to fill in.'
	};

	const infoModalBottomInputData = {
		messagePrefix: 'For the full list of metrics and their type constraints, check out the',
		href: resolve('/reference'),
		text: 'Reference',
		suffix: ' tab.'
	};

	async function processMetricsCsv(file: File): Promise<ProcessResult> {
		clearAllStores();
		onprocessstart?.();

		const parsed = await parseFile(file);
		const lastHeader = parsed.header;
		const lastRows = parsed.rows as unknown as Record<string, unknown>[];
		const filename = file.name;

		const validation = validateCsv(lastHeader, parsed.rows as unknown as unknown[][], metricMap);
		saveValidatorState(
			lastHeader,
			lastRows,
			validation as unknown as Record<string, unknown> | null,
			null,
			filename
		);

		const parseErrorMsgs = parsed.errors.map((e) => e.message ?? String(e)).filter(Boolean);
		if (!validation.ok || parseErrorMsgs.length > 0) {
			const parts: string[] = [];
			const details: ProcessResult['details'] = [];

			if (parseErrorMsgs.length) {
				parts.push(`${parseErrorMsgs.length} parse error${parseErrorMsgs.length !== 1 ? 's' : ''}`);
				details.push({ label: 'Parse errors', type: 'error', items: parseErrorMsgs });
			}
			if (validation.headerErrors?.length) {
				parts.push(
					`${validation.headerErrors.length} header error${validation.headerErrors.length !== 1 ? 's' : ''}`
				);
				details.push({
					label: 'Header errors',
					type: 'error',
					items: validation.headerErrors as string[]
				});
			}
			if (validation.cellErrors?.length) {
				const n = validation.cellErrors.length;
				parts.push(`${n} cell error${n !== 1 ? 's' : ''}`);
				details.push({
					label: 'Cell errors',
					type: 'error',
					items: [`${n} cell error${n !== 1 ? 's' : ''} — full list on the details page`]
				});
			}
			if (validation.warnings?.length) {
				parts.push(
					`${validation.warnings.length} warning${validation.warnings.length !== 1 ? 's' : ''}`
				);
				details.push({
					label: 'Warnings',
					type: 'warning',
					items: validation.warnings as string[]
				});
			}

			return {
				ok: false,
				summary: parts.join(' · ') || 'Validation failed',
				details: details.length ? details : undefined
			};
		}

		if (validation.numericObjects?.length) {
			try {
				await runPipeline({
					header: lastHeader,
					rows: lastRows,
					filename,
					metricMap,
					referenceJson: metricStore.referenceJson
				});
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				return { ok: false, summary: `Pipeline error: ${msg}` };
			}
		}

		return {
			ok: true,
			summary: `${validation.numericObjects?.length ?? 0} rows · ${lastHeader.length} columns`,
			details: validation.warnings?.length
				? [{ label: 'Warnings', type: 'warning', items: validation.warnings as string[] }]
				: undefined
		};
	}
</script>

<Card title="Get started" subtitle="Upload a CSV file with your data.">
	{#snippet titleActions()}
		<InfoButton
			label="Format"
			title="CSV format reference"
			onclick={() => (showFormatModal = true)}
		/>
	{/snippet}

	<div class="mt-4">
		<Uploader
			dropText="Drop a CSV here, or click to browse"
			process={processMetricsCsv}
			detailsMode="collapse"
			detailsHref="/validate"
			onaccepted={() => onaccepted?.()}
			oncleared={() => oncleared?.()}
		/>
	</div>
</Card>

<!-- eslint-disable-next-line svelte/valid-href -->
<InfoModal
	bind:isOpen={showFormatModal}
	title="CSV format guide"
	description="How to structure your file before uploading."
	items={infoModalItemsInputData}
	topInfo={infoModalTopInputData}
	bottomInfo={infoModalBottomInputData}
/>
