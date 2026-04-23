import { PRELIM_FLAG_BADGE } from '$lib/utils/colors';

const PAINT_PROPS = [
	'fill',
	'stroke',
	'stroke-width',
	'stroke-opacity',
	'fill-opacity',
	'opacity',
	'font-size',
	'font-family',
	'font-weight'
] as const;

const FONT = 'system-ui, -apple-system, Arial, sans-serif';
const PRELIM_KEYS = ['EM', 'ROEM', 'ACUTE', 'ACUTE_NEEDS', 'INSUFFICIENT_EVIDENCE', 'NO_DATA'] as const;
const FLAGGED_STATUSES = new Set(['EM', 'ROEM', 'ACUTE', 'ACUTE_NEEDS']);

let _measureCanvas: HTMLCanvasElement | null = null;
/** Measure rendered text width using canvas — exact, avoids character-width estimates. */
function measureText(text: string, fontSize: number, bold = false): number {
	if (typeof document === 'undefined') return text.length * 7;
	if (!_measureCanvas) _measureCanvas = document.createElement('canvas');
	const ctx = _measureCanvas.getContext('2d');
	if (!ctx) return text.length * 7;
	ctx.font = `${bold ? 'bold ' : ''}${fontSize}px ${FONT}`;
	return ctx.measureText(text).width;
}

// ── Private helpers ───────────────────────────────────────────────────────────

function createLightContainer(): HTMLDivElement {
	const el = document.createElement('div');
	el.setAttribute('data-theme', 'ana-light');
	el.style.cssText = 'position:absolute;left:-9999px;top:-9999px;visibility:hidden';
	document.body.appendChild(el);
	return el;
}

/** Inline computed paint styles on every SVG element. Must be called while `svgEl` is inside a light-themed container. */
function inlineStyles(svgEl: SVGSVGElement): void {
	for (const el of svgEl.querySelectorAll('*')) {
		if (!(el instanceof SVGElement)) continue;
		const computed = getComputedStyle(el);
		const parts: string[] = [];
		for (const prop of PAINT_PROPS) {
			const val = computed.getPropertyValue(prop).trim();
			if (val) parts.push(`${prop}:${val}`);
		}
		if (parts.length) el.setAttribute('style', parts.join(';'));
	}
}

/** Resolve a `var(--token)` string against a live container. */
function resolveVar(cssVar: string, container: HTMLElement): string {
	const match = cssVar.match(/var\(\s*(--[^)\s,]+)/);
	if (!match) return cssVar;
	return getComputedStyle(container).getPropertyValue(match[1]).trim() || '#999999';
}

/** Encode an SVG string as a base64 data URI. Handles non-Latin1 chars correctly. */
function svgToDataUri(svg: string): string {
	const bytes = new TextEncoder().encode(svg);
	let binary = '';
	bytes.forEach((b) => (binary += String.fromCharCode(b)));
	return `data:image/svg+xml;base64,${btoa(binary)}`;
}

function escapeXml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ExportMapOpts {
	level: 'ADM1' | 'ADM2';
	country: string | null;
	/** Rows from flagStore — used to compute flagged count. */
	rows: { prelim_flag?: unknown }[];
	anaLogoSvg: string;
	impactLogoSvg: string;
}

/**
 * Build a self-contained composite SVG:
 *   Title · subtitle
 *   Map (light-theme colours inlined)
 *   Legend
 *   ANA + IMPACT logos (bottom-right)
 */
export function buildExportSvg(liveSvg: SVGSVGElement, opts: ExportMapOpts): string {
	const { country, rows, anaLogoSvg, impactLogoSvg } = opts;

	// Layout constants
	const PAD = 24;
	const GAP = 16;
	const TITLE_FS = 28;
	const SUB_FS = 20;
	const SWATCH = 14;
	const LEG_FS = 16;
	const INTER_ITEM_GAP = 16; // consistent gap between legend items
	const LOGO_H = 42;

	// Map dimensions
	const { width: rawW, height: rawH } = liveSvg.getBoundingClientRect();
	const mw = Math.round(rawW);
	const mh = Math.round(rawH);
	const totalW = mw + PAD * 2;

	// Light container: resolves all CSS vars against ana-light
	const container = createLightContainer();

	// Clone + inline map
	const mapClone = liveSvg.cloneNode(true) as SVGSVGElement;
	container.appendChild(mapClone);
	inlineStyles(mapClone);
	container.removeChild(mapClone);

	// Resolve legend colours while container still alive
	const resolvedColors: Record<string, string> = {};
	for (const key of PRELIM_KEYS) {
		const badge = PRELIM_FLAG_BADGE[key];
		if (badge) resolvedColors[key] = resolveVar(badge.bg, container);
	}

	document.body.removeChild(container);

	// Finalise map clone attributes
	mapClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
	mapClone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
	mapClone.setAttribute('width', String(mw));
	mapClone.setAttribute('height', String(mh));

	// Title + subtitle strings
	const countryPart = country ? ` for ${country}` : '';
	const title = `Preliminary flag of Acute Needs Analysis${countryPart}`;
	const flaggedCount = rows.filter((r) => FLAGGED_STATUSES.has(String(r.prelim_flag ?? ''))).length;
	const now = new Date();
	const datePart = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
	const timePart = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
	const subtitle = `${flaggedCount} of ${rows.length} unit${rows.length !== 1 ? 's' : ''} of analysis flagged · Downloaded at: ${datePart} ${timePart}`;

	// Y layout
	const titleY = PAD + TITLE_FS; // text baseline
	const subY = titleY + 7 + SUB_FS;
	const mapY = subY + 8 + GAP;

	// Legend
	const contentW = mw;
	const ROW_H = SWATCH + 10;

	// "Flag:" heading on its own line
	const flagLabelFs = LEG_FS;
	let legendSvg = `<text x="0" y="${flagLabelFs}" font-family="${FONT}" font-size="${flagLabelFs}" font-weight="bold" fill="#374151">Flag:</text>`;

	// Items start on the line below the heading
	const itemsStartY = flagLabelFs + 8;
	let lx = 0;
	let lrow = 0;

	for (const key of PRELIM_KEYS) {
		const badge = PRELIM_FLAG_BADGE[key];
		if (!badge) continue;
		const color = resolvedColors[key] ?? '#999';
		const textW = Math.ceil(measureText(badge.label, LEG_FS));
		const itemW = SWATCH + 4 + textW + INTER_ITEM_GAP;
		if (lx + itemW > contentW && lx > 0) {
			lx = 0;
			lrow++;
		}
		const iy = itemsStartY + lrow * ROW_H;
		legendSvg += `<rect x="${lx}" y="${iy}" width="${SWATCH}" height="${SWATCH}" rx="2" fill="${color}"/>`;
		legendSvg += `<text x="${lx + SWATCH + 4}" y="${iy + SWATCH - 1}" font-family="${FONT}" font-size="${LEG_FS}" fill="#374151">${escapeXml(badge.label)}</text>`;
		lx += itemW;
	}

	const legendH = itemsStartY + (lrow + 1) * ROW_H - 4;
	const legendY = mapY + mh + GAP;

	// Logos (bottom-right aligned)
	const logoY = legendY + legendH + GAP;
	const ANA_W = Math.round(LOGO_H * (409.83 / 448.24));
	const IMPACT_W = Math.round(LOGO_H * (728 / 196.32));
	const impactX = totalW - PAD - IMPACT_W;
	const anaX = impactX - 12 - ANA_W;

	const totalH = logoY + LOGO_H + PAD;

	const mapSvgStr = new XMLSerializer().serializeToString(mapClone);

	return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${totalW}" height="${totalH}">
  <rect width="${totalW}" height="${totalH}" fill="white"/>
  <text x="${PAD}" y="${titleY}" font-family="${FONT}" font-size="${TITLE_FS}" font-weight="bold" fill="#111827">${escapeXml(title)}</text>
  <text x="${PAD}" y="${subY}" font-family="${FONT}" font-size="${SUB_FS}" fill="#6b7280">${escapeXml(subtitle)}</text>
  ${mapSvgStr.replace(/^<svg /, `<svg x="${PAD}" y="${mapY}" `)}
  <g transform="translate(${PAD}, ${legendY})">${legendSvg}</g>
  <image href="${svgToDataUri(anaLogoSvg)}" x="${anaX}" y="${logoY}" width="${ANA_W}" height="${LOGO_H}"/>
  <image href="${svgToDataUri(impactLogoSvg)}" x="${impactX}" y="${logoY}" width="${IMPACT_W}" height="${LOGO_H}"/>
</svg>`;
}

/** Trigger a browser download of an SVG string. */
export function downloadSvg(svgString: string, filename: string): void {
	const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.click();
	URL.revokeObjectURL(url);
}

/** Build a descriptive filename: `choropleth_{country}_{level}_{YYYY-MM-DD}.svg` */
export function buildMapFilename(level: 'ADM1' | 'ADM2', country: string | null): string {
	const slug = country ? country.toUpperCase().replace(/[^A-Z0-9-]/g, '') : 'map';
	const date = new Date().toISOString().slice(0, 10);
	return `choropleth_${slug}_${level}_${date}.svg`;
}
