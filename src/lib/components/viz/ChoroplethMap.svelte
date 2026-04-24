<script lang="ts">
	import { Plot, Geo } from 'svelteplot';
	import { geoIdentity, geoBounds } from 'd3-geo';
	import { tick } from 'svelte';
	import type { FeatureCollection, Geometry } from 'geojson';
	import { PRELIM_FLAG_BADGE, FLAG_BADGE } from '$lib/utils/colors';
	import TooltipCard from '$lib/components/ui/TooltipCard.svelte';
	import LegendBadge from '$lib/components/ui/LegendBadge.svelte';
	import { adminFeaturesStore } from '$lib/stores/adminFeaturesStore.svelte';
	import { buildExportSvg, downloadSvg, buildMapFilename } from '$lib/engine/exportMap';
	import anaLogoRaw from '$lib/assets/LogoANA2026.svg?raw';
	import impactLogoRaw from '$lib/assets/IMPACT.svg?raw';

	type Row = Record<string, unknown>;
	type GeoFC = FeatureCollection<Geometry, Record<string, unknown>>;

	/** Discriminated union describing which data field to visualise on the map. */
	export type MapLayer =
		| { type: 'prelim' }
		| { type: 'status'; field: string; hasInsufficient: boolean };

	interface Props {
		adm1: GeoFC;
		adm2: GeoFC | null;
		rows: Row[];
		level: 'ADM1' | 'ADM2';
		/** Human-readable country name for the export title. */
		country?: string | null;
		/** Which field to colour by. Defaults to prelim flag. */
		layer?: MapLayer;
		/** Called with the UOA code and admin name when the user clicks an admin area. */
		onuoaclick?: (uoa: string, adminName: string | null) => void;
		/** Called once the map is ready, passing a function that triggers SVG download. */
		ondownloadready?: (fn: () => Promise<void>) => void;
		/** Title for the exported SVG. Overrides the default prelim title when set. */
		layerTitle?: string | null;
	}

	let {
		adm1,
		adm2,
		rows,
		level,
		country = null,
		layer = { type: 'prelim' },
		onuoaclick,
		ondownloadready,
		layerTitle = null
	}: Props = $props();

	let hoveredFeature: { properties: Record<string, unknown>; geometry: unknown } | null =
		$state(null);
	let tooltipX = $state(0);
	let tooltipY = $state(0);
	let containerWidth = $state(0);
	// Wraps only the <Plot> — no other SVGs inside, so querySelector('svg') is unambiguous.
	let mapEl: HTMLDivElement | undefined = $state();

	$effect(() => {
		if (mapEl) ondownloadready?.(handleSvgDownload);
	});

	async function handleSvgDownload() {
		hoveredFeature = null;
		await tick();
		const svg = mapEl?.querySelector('svg') as SVGSVGElement | null;
		if (!svg) return;

		let legendEntries: { varOrColor: string; label: string }[] | undefined;
		let flaggedCount: number | undefined;

		if (layer.type === 'status') {
			const statusKeys = layer.hasInsufficient
				? ['flag', 'no_flag', 'insufficient_evidence', 'no_data']
				: ['flag', 'no_flag', 'no_data'];
			legendEntries = statusKeys.map((k) => ({
				varOrColor: `var(${FLAG_BADGE[k].colorVar})`,
				label: FLAG_BADGE[k].label
			}));
			flaggedCount = rows.filter((r) => r[layer.field] === 'flag').length;
		}

		const svgStr = buildExportSvg(svg, {
			level,
			country,
			rows,
			anaLogoSvg: anaLogoRaw,
			impactLogoSvg: impactLogoRaw,
			legendEntries,
			flaggedCount,
			layerTitle
		});
		downloadSvg(svgStr, buildMapFilename(level, country));
	}

	const aspectRatio = $derived.by(() => {
		const [[minX, minY], [maxX, maxY]] = geoBounds(adm1);
		const w = maxX - minX;
		const h = maxY - minY;
		return w > 0 && h > 0 ? w / h : 1.5;
	});

	const plotHeight = $derived(
		containerWidth > 0 ? Math.round(Math.max(150, Math.min(700, containerWidth / aspectRatio))) : 0
	);

	const NO_DATA_COLOR = PRELIM_FLAG_BADGE['NO_DATA']?.bg ?? 'var(--color-no-data)';

	// Pre-extract p-codes per feature — only reruns when GeoJSON or level changes, not on rows filter.
	const featureWithCodes = $derived.by(() => {
		const source = level === 'ADM2' ? (adm2?.features ?? []) : (adm1?.features ?? []);
		return source.map((f) => ({
			feature: f,
			code:
				level === 'ADM2'
					? (f.properties?.adm2_source_code as string | undefined)
					: ((f.properties?.adm1_source_code ?? f.properties?.pcode) as string | undefined)
		}));
	});

	// Enrich each fill feature with flagColor + flagLabel — reruns on rows or layer change.
	const fillFeatures = $derived.by(() => {
		const lookup = new Map(rows.map((r) => [String(r.uoa), r]));
		return featureWithCodes.map(({ feature: f, code }) => {
			const row = code ? lookup.get(code) : undefined;
			let flagColor: string;
			let flagLabel: string;

			if (!row) {
				flagColor = NO_DATA_COLOR;
				flagLabel = PRELIM_FLAG_BADGE['NO_DATA']?.label ?? 'No Data';
			} else if (layer.type === 'prelim') {
				const flag = String(row.prelim_flag ?? '');
				const badge = flag ? PRELIM_FLAG_BADGE[flag] : undefined;
				flagColor = badge?.bg ?? NO_DATA_COLOR;
				flagLabel = badge?.label ?? (PRELIM_FLAG_BADGE['NO_DATA']?.label ?? 'No Data');
			} else {
				const status = String(row[layer.field] ?? 'no_data');
				const badge = FLAG_BADGE[status];
				flagColor = badge ? `var(${badge.colorVar})` : NO_DATA_COLOR;
				flagLabel = badge?.label ?? (FLAG_BADGE['no_data']?.label ?? 'No Data');
			}

			return { ...f, properties: { ...f.properties, flagColor, flagLabel, hasData: !!row, code } };
		});
	});

	// Tooltip derived values from the enriched hovered feature
	const tooltipTitle = $derived(
		hoveredFeature?.properties?.gis_name ??
			hoveredFeature?.properties?.name ??
			hoveredFeature?.properties?.code ??
			''
	);
	const tooltipSwatch = $derived(
		hoveredFeature
			? [{ color: hoveredFeature.properties.flagColor, label: hoveredFeature.properties.flagLabel }]
			: []
	);
	const tooltipRows = $derived(
		hoveredFeature?.properties?.code
			? [{ key: 'Code', value: String(hoveredFeature.properties.code) }]
			: []
	);

	const legendStatusKeys = $derived(
		layer.type === 'status'
			? layer.hasInsufficient
				? ['flag', 'no_flag', 'insufficient_evidence', 'no_data']
				: ['flag', 'no_flag', 'no_data']
			: []
	);
</script>

<!--
  geoIdentity().reflectY(true) treats the stored GeoJSON lon/lat as a flat
  projected CRS with Y-axis flipped to match SVG. fitSize maps the adm1
  bounding box to the resolved plot area.
  CSS var colors bypass SveltePlot's color scale automatically.
-->
<div bind:clientWidth={containerWidth}>
	{#if plotHeight > 0}
		<!-- mapEl wraps only the Plot — keeps querySelector('svg') unambiguous -->
		<div bind:this={mapEl}>
			<Plot
				axes={false}
				height={plotHeight}
				margin={0}
				projection={{
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					type: ({ width, height }) => geoIdentity().reflectY(true).fitSize([width, height], adm1) as any
				}}
			>
				<!-- Colored fill layer -->
				<Geo
					data={fillFeatures}
					fill={{ value: (d) => d.properties.flagColor, scale: null }}
					stroke="var(--color-base-content)"
					strokeWidth={0.5}
					cursor={onuoaclick ? 'pointer' : undefined}
					onmouseover={(_e, f) => {
						if (hoveredFeature !== f) hoveredFeature = f;
					}}
					onmousemove={(e) => {
						const me = e as unknown as MouseEvent;
						tooltipX = me.clientX;
						tooltipY = me.clientY;
					}}
					onmouseout={() => {
						hoveredFeature = null;
					}}
					onclick={(_e, f) => {
						const props = f.properties as Record<string, unknown>;
						const code = props?.code as string | undefined;
						if (code) {
							const name = (adminFeaturesStore.pcodeLabelMap?.[code] ??
								props?.gis_name ??
								props?.name ??
								null) as string | null;
							onuoaclick?.(code, name);
						}
					}}
				/>

				<!-- Hover highlight layer — separate Geo so SveltePlot re-renders on state change -->
				{#if hoveredFeature}
					<Geo
						data={[hoveredFeature]}
						fill={false}
						fillOpacity={0}
						stroke="var(--color-base-content)"
						strokeWidth={3.5}
						style="pointer-events: none"
					/>
				{/if}

				<!-- ADM1 outlines on top — decorative only, pointer events disabled -->
				<Geo
					data={adm1.features}
					fillOpacity={0}
					stroke="var(--color-base-content)"
					strokeWidth={2}
					style="pointer-events: none"
				/>
			</Plot>
		</div>
	{/if}
</div>

{#if hoveredFeature}
	<TooltipCard
		title={tooltipTitle}
		swatches={tooltipSwatch}
		rows={tooltipRows}
		x={tooltipX}
		y={tooltipY}
	/>
{/if}

{#if layer.type === 'prelim'}
	<LegendBadge
		keys={[]}
		prelimKeys={['EM', 'ROEM', 'ACUTE', 'ACUTE_NEEDS', 'INSUFFICIENT_EVIDENCE', 'NO_DATA']}
	/>
{:else}
	<LegendBadge keys={legendStatusKeys} />
{/if}
