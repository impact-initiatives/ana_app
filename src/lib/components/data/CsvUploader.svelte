<script lang="ts">
	import { parseFile } from '$lib/engine/parser';
	import ButtonClear from '$lib/components/ui/ButtonClear.svelte';

	interface ParseResult {
		file: File;
		fileName: string;
		header: string[];
		rows: unknown[];
		meta: unknown;
		errors: { message?: string; [key: string]: unknown }[];
	}

	interface Props {
		accept?: string;
		hintText?: string;
		size?: 'sm' | 'md';
		parseOptions?: Record<string, unknown>;
		onparsed?: (result: ParseResult) => void;
		onerror?: (detail: { message: string; errors?: unknown[] }) => void;
		oncleared?: () => void;
	}

	let {
		accept = '.csv',
		hintText = '',
		size = 'md',
		parseOptions = {},
		onparsed,
		onerror,
		oncleared
	}: Props = $props();

	const sm = $derived(size === 'sm');

	let fileInput = $state<HTMLInputElement | null>(null);
	let fileName = $state('');
	let status = $state<'idle' | 'parsing' | 'done' | 'error'>('idle');
	let isDragging = $state(false);

	async function handleFiles(fileList: FileList | null) {
		if (!fileList || fileList.length === 0) return;
		const file = fileList[0];
		fileName = file.name;
		status = 'parsing';

		try {
			const result = await parseFile(file, parseOptions);
			const detail: ParseResult = {
				file,
				fileName: file.name,
				header: result.header,
				rows: result.rows,
				meta: result.meta,
				errors: result.errors || []
			};

			if (result.errors && result.errors.length) {
				status = 'error';
				onerror?.({ message: 'Parsing produced errors', errors: result.errors });
			} else {
				status = 'done';
			}
			onparsed?.(detail);
		} catch (err) {
			status = 'error';
			onerror?.({ message: err instanceof Error ? err.message : String(err) });
		}
	}

	function onInputChange(e: Event) {
		handleFiles((e.target as HTMLInputElement).files);
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
		handleFiles(e.dataTransfer?.files ?? null);
	}

	function onDragOver(e: DragEvent) {
		e.preventDefault();
		isDragging = true;
	}

	function onDragLeave() {
		isDragging = false;
	}

	function clearAll() {
		if (fileInput) fileInput.value = '';
		fileName = '';
		status = 'idle';
		isDragging = false;
		oncleared?.();
	}

	function triggerBrowse() {
		if (status === 'idle' || status === 'error') fileInput?.click();
	}
</script>

<!-- Hidden file input -->
<input
	bind:this={fileInput}
	type="file"
	{accept}
	onchange={onInputChange}
	class="sr-only"
	aria-label="Choose a CSV file"
/>

<div
	role="button"
	tabindex="0"
	aria-label={status === 'idle' ? 'Drop a CSV file or click to browse' : fileName}
	class={[
		'rounded-box flex items-center border-2 border-dashed transition-colors duration-150',
		sm ? 'gap-3 px-3 py-2' : 'gap-4 px-4 py-4',
		isDragging
			? 'border-primary bg-primary/8 cursor-copy'
			: status === 'done'
				? 'border-success/40 bg-success/5 cursor-default'
				: status === 'error'
					? 'border-error/40 bg-error/5 cursor-pointer'
					: 'border-base-300 hover:border-primary/80 cursor-pointer'
	].join(' ')}
	ondrop={onDrop}
	ondragover={onDragOver}
	ondragleave={onDragLeave}
	onclick={triggerBrowse}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') triggerBrowse();
	}}
>
	<!-- Icon -->
	<div class="shrink-0">
		{#if status === 'parsing'}
			<span class={['loading loading-spinner text-primary', sm ? 'loading-xs' : 'loading-sm'].join(' ')}></span>
		{:else if status === 'done'}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class={['text-success', sm ? 'size-4' : 'size-6'].join(' ')}
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
				<polyline points="22 4 12 14.01 9 11.01" />
			</svg>
		{:else if status === 'error'}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class={['text-error', sm ? 'size-4' : 'size-6'].join(' ')}
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<circle cx="12" cy="12" r="10" />
				<line x1="12" y1="8" x2="12" y2="12" />
				<line x1="12" y1="16" x2="12.01" y2="16" />
			</svg>
		{:else}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class={['text-primary', sm ? 'size-4' : 'size-6'].join(' ')}
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
		{/if}
	</div>

	<!-- Text -->
	<div class="min-w-0 flex-1">
		{#if status === 'parsing'}
			<p class={sm ? 'text-xs font-medium' : 'text-sm font-medium'}>Parsing…</p>
		{:else if status === 'done'}
			<p class={['text-success truncate font-semibold', sm ? 'text-xs' : 'text-sm'].join(' ')}>{fileName}</p>
			<p class="text-base-content/75 text-xs">Parsed successfully</p>
		{:else if status === 'error'}
			<p class={['text-error truncate font-semibold', sm ? 'text-xs' : 'text-sm'].join(' ')}>{fileName || 'Parse failed'}</p>
			<p class="text-base-content/75 text-xs">Click to try again</p>
		{:else}
			<p class={['text-base-content/75', sm ? 'text-xs' : 'text-sm'].join(' ')}>
				{isDragging ? 'Drop to upload' : 'Drop a CSV here, or click to browse'}
			</p>
			{#if hintText}
				<p class="text-base-content/75 mt-0.5 text-xs">{@html hintText}</p>
			{/if}
		{/if}
	</div>

	<!-- Right action -->
	{#if status === 'done' || status === 'error'}
		<div
			class="shrink-0"
			role="presentation"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<ButtonClear size="sm" onclick={clearAll} />
		</div>
	{/if}
</div>
