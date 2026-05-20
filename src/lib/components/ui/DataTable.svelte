<script lang="ts">
	import type { Snippet } from 'svelte';
	import Chevron from '$lib/components/ui/Chevron.svelte';
	import Search from '$lib/components/ui/Search.svelte';
	import SortIcon from '$lib/components/ui/SortIcon.svelte';
	import DownloadButton from '$lib/components/ui/DownloadButton.svelte';

	interface Props {
		/** Row data as plain objects. Column order follows key insertion order of the first row. */
		rows?: Record<string, unknown>[];
		/** Extra classes on the <table> element, e.g. "table-zebra table-sm" */
		tableClass?: string;
		/** Tailwind classes on the <thead> <tr>, e.g. "bg-error/10 text-error" */
		headerRowClass?: string;
		/** Tailwind classes on every <tbody> <tr>, e.g. "hover:bg-base-200" */
		rowClass?: string;
		/** Alternate row background (zebra stripe). Default false = no stripe. */
		stripe?: boolean;
		/** Optional custom cell renderer. Receives col name, string value, indices, and the full row as a string map. */
		renderCell?: Snippet<[{ col: string; value: string; colIndex: number; rowIndex: number; rowObj: Record<string, string> }]>;
		/** Per-cell style callback. Return a CSS style string (e.g. 'background-color: red') or undefined. */
		getCellStyle?: (col: string, rowObj: Record<string, string>) => string | undefined;
		/** Stick the first column to the left edge during horizontal scroll. */
		stickyFirstColumn?: boolean;
		/**
		 * Per-column display options keyed by column name.
		 * - wrap: true  → text wraps (white-space: normal), column is fixed by maxWidth
		 * - wrap: false → text does not wrap, column width fits content (default)
		 * - extraClass: additional Tailwind classes, e.g. "max-w-48" or "min-w-24"
		 * - bg: CSS color string for cell background (takes precedence over rowColor)
		 * - text: CSS color string for cell text (takes precedence over rowColor)
		 */
		colOptions?: Record<
			string,
			{ wrap?: boolean; extraClass?: string; bg?: string; text?: string }
		>;
		/**
		 * Declarative per-row colouring. Structure: { columnName: { cellValue: { bg?, text? } } }.
		 * When a row's cell in `columnName` equals `cellValue`, the whole row gets that bg/text.
		 * First matching column wins. Column-level bg/text in colOptions takes precedence.
		 */
		rowColor?: Record<string, Record<string, { bg?: string; text?: string }>>;
		/** Show a global search input above the table. Default false. */
		searchable?: boolean;
		/** Show per-column filter inputs in a second header row. Default false. */
		columnSearchable?: boolean;
		/** Placeholder text for the global search input. */
		searchPlaceholder?: string;
		/** Transform boolean true/false to ✓ and ✗. Default true. */
		booleanToStr?: boolean;
		/**
		 * How to handle row overflow.
		 * - 'none'     — show all rows (default)
		 * - 'paginate' — split into pages; use pageSize to control page length
		 * - 'scroll'   — fixed-height scrollable container with sticky header; use scrollHeight to control height
		 */
		overflow?: 'none' | 'paginate' | 'scroll';
		/** Rows per page. Only used when overflow='paginate'. Default 25. */
		pageSize?: number;
		/** CSS max-height of the scroll container. Only used when overflow='scroll'. Default '32rem'. */
		scrollHeight?: string;
		/**
		 * Called when a body row is clicked. Receives a `{ colName: displayValue }` map
		 * for the clicked row, plus the 0-based index within `sortedData`.
		 */
		onrowclick?: (cells: Record<string, string>, rowIndex: number) => void;
		/** Show a download CSV button next to the search bar (requires searchable=true). Default false. */
		downloadable?: boolean;
		/** Filename for the downloaded CSV (without extension). Default 'table'. */
		downloadFilename?: string;
		/** Optional title rendered in the toolbar row, left of search and download. */
		title?: string;
		/** Tailwind classes for the title. Default 'font-semibold'. */
		titleClass?: string;
		/** Convert snake_case column keys to Sentence case for display (e.g. risk_concept → Risk concept). Default false. */
		humanizeHeaders?: boolean;
		/** Tailwind class(es) for row divider borders, e.g. 'border-base-100' or 'border-white'. */
		rowDividerClass?: string;
		/** Tailwind classes applied to every <th>, e.g. 'bg-base-200' for an opaque header background. */
		headerThClass?: string;
		/**
		 * Declarative badge rendering. Structure: { columnName: { cellValue: { label?, style?, class? } } }.
		 * Exact value match wins; '*' is a catch-all for any unmatched value.
		 * Matched cells render as <span class="badge badge-sm {class}" style={style}>{label ?? cell}</span>.
		 * renderCell takes precedence when both are set.
		 */
		cellBadges?: Record<string, Record<string, { label?: string; style?: string; class?: string }>>;
		/** Disable column sorting (removes arrows and click handlers). Default true. */
		sortable?: boolean;
		/** Pre-populate the global search input with this value on mount. */
		initialSearch?: string;
	}
	let {
		rows = [],
		tableClass = 'table-sm',
		headerRowClass = 'text-primary text-sm',
		rowClass = 'hover:bg-base-200',
		stripe = false,
		renderCell,
		colOptions = {},
		searchable = false,
		columnSearchable = false,
		searchPlaceholder = 'Search...',
		booleanToStr = true,
		overflow = 'none',
		pageSize = 25,
		scrollHeight = '48rem',
		onrowclick,
		downloadable = false,
		downloadFilename = 'table',
		title,
		titleClass = 'font-semibold text-md',
		humanizeHeaders = false,
		rowColor,
		rowDividerClass = 'border-base-300',
		headerThClass = 'bg-primary/20',
		cellBadges,
		getCellStyle,
		stickyFirstColumn = false,
		sortable = true,
		initialSearch = ''
	}: Props = $props();

	function humanizeCol(col: string): string {
		return col.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
	}

	function resolveRowColor(rowObj: Record<string, string>) {
		if (!rowColor) return undefined;
		for (const [col, vals] of Object.entries(rowColor)) {
			const match = vals[rowObj[col] ?? ''];
			if (match) return match;
		}
		return undefined;
	}

	const columns = $derived(rows.length > 0 ? Object.keys(rows[0]) : []);

	function toStr(v: unknown): string {
		if (v == null) return '-';
		if (typeof v === 'boolean') return v ? '\u2713' : '\u2717';
		return String(v);
	}

	const data = $derived(
		rows.map((row) => columns.map((col) => (booleanToStr ? toStr(row[col]) : row[col])))
	);

	function colClass(colName: string): string {
		const opt = colOptions?.[colName];
		const base = opt?.wrap ? 'whitespace-normal break-words' : 'whitespace-nowrap';
		return opt?.extraClass ? `${base} ${opt.extraClass}` : base;
	}

	function headerBtnClass(colName: string): string {
		const opt = colOptions?.[colName];
		const isCentered = (opt?.extraClass ?? '').includes('text-center');
		const wrapCls = opt?.wrap ? ' whitespace-normal break-words' : '';
		return `hover:text-base-content/80 flex items-center gap-1 font-semibold${isCentered ? ' w-full justify-center' : ''}${wrapCls}`;
	}

	// ── Search ────────────────────────────────────────────────────────────────
	let searchQuery = $state<string>(initialSearch);
	let columnQueries = $state<Record<number, string>>({});

	const filteredData = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return data;
		return data.filter((row) => row.some((cell) => String(cell).toLowerCase().includes(q)));
	});

	const columnFilteredData = $derived.by(() => {
		const active = Object.entries(columnQueries).filter(([, v]) => v.trim());
		if (active.length === 0) return filteredData;
		return filteredData.filter((row) =>
			active.every(([j, q]) =>
				String(row[Number(j)] ?? '')
					.toLowerCase()
					.includes(q.trim().toLowerCase())
			)
		);
	});

	// ── Sort ──────────────────────────────────────────────────────────────────
	let sortCol = $state<number | null>(null);
	let sortAsc = $state(true);

	function toggleSort(colIndex: number) {
		if (sortCol === colIndex) {
			sortAsc = !sortAsc;
		} else {
			sortCol = colIndex;
			sortAsc = true;
		}
		page = 0;
	}

	const sortedData = $derived.by(() => {
		if (sortCol === null) return columnFilteredData;
		return [...columnFilteredData].sort((a, b) => {
			const av = a[sortCol!] ?? '';
			const bv = b[sortCol!] ?? '';
			const an = Number(av);
			const bn = Number(bv);
			const cmp =
				!Number.isNaN(an) && !Number.isNaN(bn) ? an - bn : String(av).localeCompare(String(bv));
			return sortAsc ? cmp : -cmp;
		});
	});

	// ── CSV download ─────────────────────────────────────────────────────────
	function downloadCsv() {
		const escape = (v: unknown) => {
			const s = String(v ?? '');
			return s.includes(',') || s.includes('"') || s.includes('\n')
				? `"${s.replace(/"/g, '""')}"`
				: s;
		};
		const lines = [columns.map(escape).join(',')];
		for (const row of sortedData) lines.push(row.map(escape).join(','));
		const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${downloadFilename}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}

	// ── Pagination ────────────────────────────────────────────────────────────
	let page = $state(0);

	$effect(() => {
		void columnFilteredData;
		page = 0;
	});

	const effectivePageSize = $derived(overflow === 'paginate' ? pageSize : 0);

	const pageCount = $derived(
		effectivePageSize > 0 ? Math.ceil(sortedData.length / effectivePageSize) : 1
	);
	const pageRows = $derived(
		effectivePageSize > 0
			? sortedData.slice(page * effectivePageSize, (page + 1) * effectivePageSize)
			: sortedData
	);
</script>

<div class="flex flex-col gap-2">
	{#if title || searchable || downloadable}
		<div class="flex items-center gap-2">
			{#if title}
				<span class={titleClass}>{title}</span>
			{/if}
			{#if searchable}
				<div class="flex-1">
					<Search bind:value={searchQuery} placeholder={searchPlaceholder} />
				</div>
			{/if}
			{#if downloadable}
				<DownloadButton onclick={downloadCsv} label="Download as CSV" variant="outline" />
			{/if}
		</div>
	{/if}

	{#snippet theadMarkup()}
		<tr class={headerRowClass}>
			{#each columns as col, j (col)}
				<svelte:element
					this={!stickyFirstColumn || j === 0 ? 'th' : 'td'}
					class="{colClass(col)} select-none{rowDividerClass
						? ' ' + rowDividerClass
						: ''}{headerThClass ? ' ' + headerThClass : ''}"
				>
					{#if sortable}
						<button
							class={headerBtnClass(col)}
							onclick={() => toggleSort(j)}
							aria-label="Sort by {col}"
						>
							{humanizeHeaders ? humanizeCol(col) : col}
							<SortIcon active={sortCol === j} asc={sortAsc} />
						</button>
					{:else}
						<span class={headerBtnClass(col)}>{humanizeHeaders ? humanizeCol(col) : col}</span>
					{/if}
				</svelte:element>
			{/each}
		</tr>
		{#if columnSearchable}
			<tr class={headerRowClass}>
				{#each columns as col, j (col)}
					<svelte:element this={!stickyFirstColumn || j === 0 ? 'th' : 'td'} class="py-1">
						<input
							type="search"
							class="input input-xs w-full"
							placeholder="Filter..."
							value={columnQueries[j] ?? ''}
							oninput={(e) => {
								const v = (e.currentTarget as HTMLInputElement).value;
								if (v) columnQueries[j] = v;
								else delete columnQueries[j];
								columnQueries = { ...columnQueries };
								page = 0;
							}}
						/>
					</svelte:element>
				{/each}
			</tr>
		{/if}
	{/snippet}

	{#snippet tbodyMarkup()}
		{#each pageRows as row, i (i)}
			{@const rowObj = Object.fromEntries(columns.map((c, j) => [c, String(row[j] ?? '')]))}
			{@const rc = resolveRowColor(rowObj)}
			<tr
				class="group {rowClass}{stripe && i % 2 === 0 ? ' bg-base-200' : ' bg-base-100'}{onrowclick
					? ' cursor-pointer'
					: ''}"
				onclick={onrowclick ? () => onrowclick(rowObj, page * effectivePageSize + i) : undefined}
			>
				{#each row as cell, j (j)}
					{@const colName = columns[j] ?? ''}
					{@const bg = colOptions?.[colName]?.bg ?? rc?.bg}
					{@const txt = colOptions?.[colName]?.text ?? rc?.text}
					{@const cellStyle = getCellStyle?.(colName, rowObj)}
					<svelte:element
						this={stickyFirstColumn && j === 0 ? 'th' : 'td'}
						class="{colClass(colName)}{rowDividerClass ? ' ' + rowDividerClass : ''}{(bg || cellStyle) ? ' group-hover:brightness-90' : ''}{stickyFirstColumn && j === 0 ? ' group-hover:bg-base-200' : ''}"
						style={[bg && `background-color:${bg}`, txt && `color:${txt}`, cellStyle]
							.filter(Boolean)
							.join(';') || undefined}
					>
						{#if renderCell}
							{@render renderCell({ col: colName, value: String(cell), colIndex: j, rowIndex: i, rowObj })}
						{:else if cellBadges?.[colName]}
							{@const badgeMap = cellBadges[colName]}
							{@const cfg = badgeMap[String(cell)] ?? badgeMap['*']}
							{#if cfg}
								<span
									class="badge badge-sm{cfg.class ? ' ' + cfg.class : ''}"
									style={cfg.style ?? undefined}>{cfg.label ?? cell}</span
								>
							{:else}
								{cell}
							{/if}
						{:else}
							{cell}
						{/if}
					</svelte:element>
				{/each}
			</tr>
		{:else}
			<tr>
				<td colspan={columns.length} class="text-center py-4">
					No data{searchQuery || Object.values(columnQueries).some(Boolean)
						? ' matching your search'
						: ''}.
				</td>
			</tr>
		{/each}
	{/snippet}

	<div
		class="rounded-box border-base-content/30 bg-base-100 overflow-x-auto border"
		class:overflow-y-auto={overflow === 'scroll'}
		style={overflow === 'scroll' ? `max-height: ${scrollHeight}` : undefined}
	>
		<table class="table {tableClass}" class:table-pin-rows={overflow === 'scroll'} class:table-pin-cols={stickyFirstColumn}>
			<thead>{@render theadMarkup()}</thead>
			<tbody>{@render tbodyMarkup()}</tbody>
		</table>
	</div>

	<!-- Pagination -->
	{#if overflow === 'paginate' && effectivePageSize > 0 && pageCount > 1}
		<div class="flex items-center justify-between text-sm">
			<span>{sortedData.length} row(s) — page {page + 1} of {pageCount}</span>
			<div class="join">
				<button
					aria-label="First page"
					class="join-item btn btn-primary btn-soft btn-sm"
					disabled={page === 0}
					onclick={() => (page = 0)}
				>
					<Chevron variant="double-left" />
					First
				</button>
				<button
					aria-label="Previous page"
					class="join-item btn btn-primary btn-soft btn-sm"
					disabled={page === 0}
					onclick={() => (page = page - 1)}
				>
					<Chevron variant="left" />
					Prev
				</button>
				<button
					aria-label="Next page"
					class="join-item btn btn-primary btn-soft btn-sm"
					disabled={page >= pageCount - 1}
					onclick={() => (page = page + 1)}
				>
					Next
					<Chevron variant="right" />
				</button>
				<button
					aria-label="Last page"
					class="join-item btn btn-primary btn-soft btn-sm"
					disabled={page >= pageCount - 1}
					onclick={() => (page = pageCount - 1)}
				>
					Last
					<Chevron variant="double-right" />
				</button>
			</div>
		</div>
	{/if}
</div>
