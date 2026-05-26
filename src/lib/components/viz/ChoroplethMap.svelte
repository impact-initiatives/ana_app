<script lang="ts">
	import { Plot, Geo } from 'svelteplot';
	import { geoIdentity, geoBounds } from 'd3-geo';
	import { tick } from 'svelte';
	import type { FeatureCollection, Geometry } from 'geojson';
	import {
		getPriorityBadge,
		getFlagBadge,
		FLAG_BADGE_MAP,
		getConclusionBadge,
		CONCLUSION_KEYS
	} from '$lib/utils/colors';
	import { PRIORITY_FLAG_KEYS } from '$lib/types/flags';
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
		| { type: 'priority_flag' }
		| { type: 'conclusion' }
		| { type: 'status'; field: string; hasInsufficient: boolean };

	interface Props {
		adm1: GeoFC;
		adm2: GeoFC | null;
		rows: Row[];
		level: 'ADM1' | 'ADM2' | 'MIXED';
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
		/** UoA codes to render with a selection ring. Managed by parent. */
		selectedUoas?: string[];
		/** UoA codes to render with grey fill + dot pattern (e.g. no deep dive run). */
		patternedUoas?: string[];
	}

	let {
		adm1,
		adm2,
		rows,
		level,
		country = null,
		layer = { type: 'priority_flag' },
		onuoaclick,
		ondownloadready,
		layerTitle = null,
		selectedUoas = [],
		patternedUoas = []
	}: Props = $props();

	let hoveredFeature = $state<{ properties: Record<string, unknown>; geometry: unknown } | null>(
		null
	);
	let tooltipX = $state(0);
	let tooltipY = $state(0);
	let containerWidth = $state(0);
	// Wraps only the <Plot> — no other SVGs inside, so querySelector('svg') is unambiguous.
	let mapEl: HTMLDivElement | undefined = $state();

	$effect(() => {
		if (mapEl) ondownloadready?.(handleSvgDownload);
	});

	// Inject a dot pattern into the SveltePlot SVG so selectedFeatures can use fill="url(#sel-dots)".
	// Depends on plotHeight so it re-runs whenever Plot rebuilds its SVG.
	$effect(() => {
		if (!mapEl || plotHeight === 0) return;
		const svg = mapEl.querySelector('svg');
		if (!svg || svg.querySelector('#sel-dots')) return;
		let defs = svg.querySelector('defs');
		if (!defs) {
			defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
			svg.insertBefore(defs, svg.firstChild);
		}
		const pat = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
		pat.id = 'sel-dots';
		pat.setAttribute('patternUnits', 'userSpaceOnUse');
		pat.setAttribute('width', '5');
		pat.setAttribute('height', '5');
		const circ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		circ.setAttribute('cx', '2.5');
		circ.setAttribute('cy', '2.5');
		circ.setAttribute('r', '1');
		circ.setAttribute('style', 'fill: var(--color-base-content)');
		pat.appendChild(circ);
		defs.appendChild(pat);
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
				varOrColor: `var(${getFlagBadge(k)!.colorVar})`,
				label: getFlagBadge(k)!.label
			}));
			flaggedCount = rows.filter((r) => r[layer.field] === 'flag').length;
		} else if (layer.type === 'conclusion') {
			legendEntries = CONCLUSION_KEYS.map((k) => ({
				varOrColor: getConclusionBadge(k)?.bg ?? '#999',
				label: getConclusionBadge(k)?.label ?? k
			}));
			flaggedCount = rows.filter((r) =>
				['em', 'roem', 'an'].includes(String(r.priority_flag ?? ''))
			).length;
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

	const NO_DATA_COLOR = getPriorityBadge('no_data')?.bg ?? 'var(--color-no-data)';

	const patternedSet = $derived(new Set(patternedUoas));

	function enrichFeatures(
		features: GeoFC['features'],
		getCode: (f: GeoFC['features'][number]) => string | undefined,
		lookup: Map<string, Row>,
		transparent = false
	) {
		return features.map((f) => {
			const code = getCode(f);
			const row = code ? lookup.get(code) : undefined;
			let flagColor: string;
			let flagLabel: string;

			if (!row) {
				flagColor = transparent ? 'transparent' : NO_DATA_COLOR;
				flagLabel = getPriorityBadge('no_data')?.label ?? 'No Data';
			} else if (layer.type === 'priority_flag') {
				const flag = String(row.priority_flag ?? '');
				const badge = flag ? getPriorityBadge(flag) : undefined;
				flagColor = badge?.bg ?? NO_DATA_COLOR;
				flagLabel = badge?.label ?? getPriorityBadge('no_data')?.label ?? 'No Data';
			} else if (layer.type === 'conclusion') {
				const key = String(row.priority_flag ?? '');
				const badge = key ? getConclusionBadge(key) : null;
				flagColor = badge?.bg ?? NO_DATA_COLOR;
				flagLabel = badge?.label ?? 'No data';
			} else {
				const status = String(row[layer.field] ?? 'no_data');
				const badge = getFlagBadge(status);
				flagColor = badge ? `var(${badge.colorVar})` : NO_DATA_COLOR;
				flagLabel = badge?.label ?? FLAG_BADGE_MAP.no_data.label;
			}

			if (code && patternedSet.has(code) && row) {
				flagLabel = flagLabel + ' · no conclusion filled';
			}

			return { ...f, properties: { ...f.properties, flagColor, flagLabel, hasData: !!row, code } };
		});
	}

	// Fill features for ADM1 and ADM2 layers — reruns on rows or layer change.
	const fillFeatures = $derived.by(() => {
		const lookup = new Map(rows.map((r) => [String(r.uoa), r]));
		if (level === 'ADM2') {
			return enrichFeatures(
				adm2?.features ?? [],
				(f) => f.properties?.adm2_source_code as string | undefined,
				lookup
			);
		}
		// ADM1-only: use adm1 polygons
		return enrichFeatures(
			adm1?.features ?? [],
			(f) => (f.properties?.adm1_source_code ?? f.properties?.pcode) as string | undefined,
			lookup
		);
	});

	// MIXED mode: separate fill layers for ADM1 polygons and ADM2 polygons.
	// adm1 carries polygons in MIXED mode (not lines), so it can be both filled and used as outline.
	const fillFeaturesAdm1 = $derived.by(() => {
		if (level !== 'MIXED') return [];
		const lookup = new Map(rows.map((r) => [String(r.uoa), r]));
		return enrichFeatures(
			adm1?.features ?? [],
			(f) => (f.properties?.adm1_source_code ?? f.properties?.pcode) as string | undefined,
			lookup
		);
	});

	const fillFeaturesAdm2 = $derived.by(() => {
		if (level !== 'MIXED') return [];
		const lookup = new Map(rows.map((r) => [String(r.uoa), r]));
		// Only render ADM2 features that have matching data — unmatched features would sit
		// invisible on top and swallow pointer events from the ADM1 layer underneath.
		return enrichFeatures(
			adm2?.features ?? [],
			(f) => f.properties?.adm2_source_code as string | undefined,
			lookup
		).filter((f) => f.properties.hasData);
	});

	// Features to highlight with a selection ring.
	const selectedFeatures = $derived.by(() => {
		if (selectedUoas.length === 0) return [];
		const set = new Set(selectedUoas);
		if (level === 'ADM1') {
			return adm1.features.filter((f) => {
				const code = (f.properties?.adm1_source_code ?? f.properties?.pcode) as string | undefined;
				return code && set.has(code);
			});
		}
		if (level === 'ADM2') {
			return (adm2?.features ?? []).filter((f) => {
				const code = f.properties?.adm2_source_code as string | undefined;
				return code && set.has(code);
			});
		}
		// MIXED: UoAs can be either ADM1 or ADM2
		const adm1Sel = adm1.features.filter((f) => {
			const code = (f.properties?.adm1_source_code ?? f.properties?.pcode) as string | undefined;
			return code && set.has(code);
		});
		const adm2Sel = (adm2?.features ?? []).filter((f) => {
			const code = f.properties?.adm2_source_code as string | undefined;
			return code && set.has(code);
		});
		return [...adm1Sel, ...adm2Sel];
	});

	// Features to render with grey fill + dot pattern (e.g. no deep dive run).
	const patternedFeatures = $derived.by(() => {
		if (patternedSet.size === 0) return [];
		if (level === 'ADM1') {
			return adm1.features.filter((f) => {
				const code = (f.properties?.adm1_source_code ?? f.properties?.pcode) as string | undefined;
				return code && patternedSet.has(code);
			});
		}
		if (level === 'ADM2') {
			return (adm2?.features ?? []).filter((f) => {
				const code = f.properties?.adm2_source_code as string | undefined;
				return code && patternedSet.has(code);
			});
		}
		// MIXED
		const adm1Pat = adm1.features.filter((f) => {
			const code = (f.properties?.adm1_source_code ?? f.properties?.pcode) as string | undefined;
			return code && patternedSet.has(code);
		});
		const adm2Pat = (adm2?.features ?? []).filter((f) => {
			const code = f.properties?.adm2_source_code as string | undefined;
			return code && patternedSet.has(code);
		});
		return [...adm1Pat, ...adm2Pat];
	});

	// Tooltip derived values from the enriched hovered feature
	const tooltipTitle = $derived(
		String(
			hoveredFeature?.properties?.gis_name ??
				hoveredFeature?.properties?.name ??
				hoveredFeature?.properties?.code ??
				''
		)
	);
	const tooltipSwatch = $derived(
		hoveredFeature
			? [
					{
						color: String(hoveredFeature.properties.flagColor),
						label: String(hoveredFeature.properties.flagLabel)
					}
				]
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
		{#snippet interactionHandlers(features: typeof fillFeatures)}
			<Geo
				data={features}
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
		{/snippet}
		<!-- mapEl wraps only the Plot — keeps querySelector('svg') unambiguous -->
		<div bind:this={mapEl}>
			<Plot
				axes={false}
				height={plotHeight}
				margin={0}
				projection={{
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					type: ({ width, height }) =>
						geoIdentity().reflectY(true).fitSize([width, height], adm1) as any
				}}
			>
				{#if level === 'MIXED'}
					<!-- MIXED: ADM1 fill (bottom), ADM2 fill on top (transparent where unmatched) -->
					{@render interactionHandlers(fillFeaturesAdm1)}
					{@render interactionHandlers(fillFeaturesAdm2)}
				{:else}
					<!-- ADM1 or ADM2: single fill layer -->
					{@render interactionHandlers(fillFeatures)}
				{/if}

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

				<!-- Patterned dot-fill for "no deep dive run" UoAs -->
				{#if patternedFeatures.length > 0}
					<Geo
						data={patternedFeatures}
						fill={{ value: () => 'url(#sel-dots)', scale: null }}
						style="pointer-events: none; stroke: none"
					/>
				{/if}

				<!-- Selection dot-fill — rendered last so it sits above all other lines -->
				{#if selectedFeatures.length > 0}
					<Geo
						data={selectedFeatures}
						fill={{ value: () => 'url(#sel-dots)', scale: null }}
						style="pointer-events: none; stroke: none"
					/>
				{/if}
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

{#if layer.type === 'priority_flag'}
	<LegendBadge keys={[]} tinted={false} priorityKeys={PRIORITY_FLAG_KEYS} />
{:else if layer.type === 'conclusion'}
	<LegendBadge keys={[]} conclusionKeys={CONCLUSION_KEYS} />
	{#if patternedUoas.length > 0}
		<div class="text-base-content/85 mt-1 flex items-start gap-2 text-sm">
			<span
				class="border-base-content/75 mt-0.5 inline-block h-4 w-6 shrink-0 rounded border"
				style="background: radial-gradient(circle, var(--color-base-content) 1px, transparent 1px) 0 0 / 4px 4px"
			></span>
			<span>
				Dotted overlay: no conclusion filled yet. Color reflects the priority flag:
				<ul class="mt-0.5 list-inside list-disc space-y-0.5">
					<li>Excess Mortality: EM</li>
					<li>HO Primary / Secondary: RoEM</li>
					<li>AN Primary / Secondary: Acute Needs</li>
					<li>No Acute Needs, Insufficient Evidence, No Data: same</li>
				</ul>
			</span>
		</div>
	{/if}
{:else}
	<LegendBadge tinted={false} keys={legendStatusKeys} />
{/if}
