<script lang="ts" module>
	export interface ProcessResult {
		ok: boolean;
		summary: string;
		details?: {
			label?: string;
			type: 'error' | 'warning' | 'info';
			items: string[];
		}[];
	}
</script>

<script lang="ts">
	import { resolve } from '$app/paths';
	import ClearButton from '$lib/components/ui/ClearButton.svelte';

	interface Props {
		accept?: string;
		dropText?: string;
		hintText?: string;
		size?: 'sm' | 'md' | 'lg';
		detailsMode?: 'collapse' | 'modal' | 'none';
		detailsHref?: string;
		detailsHrefLabel?: string;
		process?: (file: File) => Promise<ProcessResult>;
		onaccepted?: (file: File, result: ProcessResult) => void;
		oncleared?: () => void;
	}

	let {
		accept = '.csv',
		dropText,
		hintText = '',
		size = 'md',
		detailsMode = 'collapse',
		detailsHref,
		detailsHrefLabel,
		process: runProcess,
		onaccepted,
		oncleared
	}: Props = $props();

	const sm = $derived(size === 'sm');
	const lg = $derived(size === 'lg');
	const defaultDropText = $derived(
		lg ? 'Drop a file here' : 'Drop a file here, or click to browse'
	);
	const idleText = $derived(dropText ?? defaultDropText);
	const iconSize = $derived(sm ? 'size-4' : lg ? 'size-8' : 'size-6');
	const spinnerSize = $derived(sm ? 'loading-xs' : lg ? 'loading-md' : 'loading-sm');

	let fileInput = $state<HTMLInputElement | null>(null);
	let detailsModal = $state<HTMLDialogElement | null>(null);
	let fileName = $state('');
	let status = $state<'idle' | 'processing' | 'done' | 'error'>('idle');
	let isDragging = $state(false);
	let result = $state<ProcessResult | null>(null);
	let showDetailsCollapse = $state(false);

	const hasDetails = $derived(result?.details?.some((d) => d.items.length > 0) ?? false);

	function fileMatchesAccept(file: File): boolean {
		if (!accept || accept === '*') return true;
		const accepted = accept.split(',').map((s) => s.trim().toLowerCase());
		const ext = file.name.includes('.') ? '.' + file.name.split('.').pop()!.toLowerCase() : '';
		return accepted.some((a) => {
			if (a.startsWith('.')) return ext === a;
			if (a.endsWith('/*')) return file.type.startsWith(a.slice(0, -2));
			return file.type === a;
		});
	}

	async function handleFiles(fileList: FileList | null) {
		if (!fileList || fileList.length === 0) return;
		const file = fileList[0];

		if (!fileMatchesAccept(file)) {
			fileName = file.name;
			result = { ok: false, summary: `Expected ${accept} file — got: ${file.name}` };
			status = 'error';
			return;
		}

		fileName = file.name;
		status = 'processing';
		result = null;
		showDetailsCollapse = false;

		// Yield so Svelte flushes the processing state before potentially heavy work
		await new Promise<void>((resolve) => setTimeout(resolve, 0));

		try {
			const r = runProcess ? await runProcess(file) : { ok: true, summary: file.name };
			result = r;
			status = r.ok ? 'done' : 'error';
			if (r.ok) onaccepted?.(file, r);
		} catch (err) {
			result = { ok: false, summary: err instanceof Error ? err.message : String(err) };
			status = 'error';
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
		result = null;
		showDetailsCollapse = false;
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
	aria-label="Choose a file"
/>

<!-- Drop zone -->
<div
	role="button"
	tabindex="0"
	aria-label={status === 'idle' ? 'Drop a file or click to browse' : fileName}
	class={[
		'rounded-box border border-dashed transition-colors duration-150 hover:border',
		lg
			? 'flex cursor-pointer flex-col items-center justify-center gap-3 px-6 py-14 text-center'
			: ['flex items-center', sm ? 'gap-3 px-3 py-2' : 'gap-4 px-4 py-4'].join(' '),
		isDragging
			? 'border-primary bg-primary/8 cursor-copy'
			: status === 'done'
				? 'border-success bg-success/10 cursor-default'
				: status === 'error'
					? 'border-error/60 bg-error/10 cursor-pointer'
					: 'border-base-content/60 bg-base-100 hover:border-primary cursor-pointer'
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
	<div class={lg ? '' : 'shrink-0'}>
		{#if status === 'processing'}
			<span class={['loading loading-spinner text-primary', spinnerSize].join(' ')}></span>
		{:else if status === 'done'}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class={['text-success', iconSize].join(' ')}
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
				class={['text-error', iconSize].join(' ')}
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
				class={['text-primary', iconSize].join(' ')}
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

	<!-- Text (non-lg) -->
	{#if !lg}
		<div class="min-w-0 flex-1">
			{#if status === 'processing'}
				<p class={sm ? 'text-xs font-medium' : 'text-sm font-medium'}>Processing…</p>
			{:else if status === 'done'}
				<p class={['text-success truncate font-semibold', sm ? 'text-xs' : 'text-sm'].join(' ')}>
					{fileName}
				</p>
			{:else if status === 'error'}
				<p class={['text-error truncate font-semibold', sm ? 'text-xs' : 'text-sm'].join(' ')}>
					{fileName || 'Upload failed'}
				</p>
				<p class="text-base-content/85 text-xs">Click to try again</p>
			{:else}
				<p
					class={['text-base-content/85 hover:text-primary', sm ? 'text-xs' : 'text-sm'].join(' ')}
				>
					{isDragging ? 'Drop to upload' : idleText}
				</p>
				{#if hintText}
					<p class="text-base-content/85 mt-0.5 text-xs">{@html hintText}</p>
				{/if}
			{/if}
		</div>
	{:else}
		<!-- Text (lg) -->
		{#if status === 'processing'}
			<p class="text-base-content/85">Processing…</p>
		{:else if status === 'done'}
			<p class="text-success max-w-sm truncate font-semibold">{fileName}</p>
		{:else if status === 'error'}
			<p class="text-error font-semibold">{fileName || 'Upload failed'}</p>
			<p class="text-base-content/85 text-sm">Click to try again</p>
		{:else}
			<p class="text-base-content/85 hover:text-primary">
				{isDragging ? 'Drop to upload' : idleText}
			</p>
			{#if hintText}
				<p class="text-base-content/85 text-sm">{@html hintText}</p>
			{:else}
				<p class="text-base-content/85 text-sm">or click to browse ({accept})</p>
			{/if}
		{/if}
	{/if}
</div>

<!-- Result row -->
{#if (status === 'done' || status === 'error') && result}
	<div class={['mt-2 flex items-center gap-2', lg ? 'justify-center' : ''].join(' ')}>
		{#if result.ok}
			<span class="badge badge-success badge-sm shrink-0">✓</span>
		{:else}
			<span class="badge badge-error badge-sm shrink-0">✗</span>
		{/if}
		<span
			class={[
				'min-w-0 flex-1',
				lg ? 'text-sm' : 'text-xs',
				result.ok ? 'text-base-content/85' : 'text-error/90'
			].join(' ')}
		>
			{result.summary}
		</span>
		{#if hasDetails && detailsMode !== 'none'}
			<button
				type="button"
				class={['btn btn-ghost btn-xs shrink-0', lg ? 'text-sm' : 'text-xs'].join(' ')}
				onclick={detailsMode === 'modal'
					? () => detailsModal?.showModal()
					: () => (showDetailsCollapse = !showDetailsCollapse)}
			>
				Details {showDetailsCollapse ? '▲' : '▾'}
			</button>
		{/if}
		<div
			class="shrink-0"
			role="presentation"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<ClearButton size="sm" onclick={clearAll} />
		</div>
	</div>

	<!-- Collapse details -->
	{#if detailsMode === 'collapse' && showDetailsCollapse && hasDetails}
		<div class="mt-1 max-h-72 space-y-2 overflow-y-auto pr-1">
			{#each result.details ?? [] as section, i (i)}
				{#if section.items.length > 0}
					<div
						class={[
							'rounded-lg border px-3 py-2',
							section.type === 'error'
								? 'bg-error/6 border-error/20'
								: section.type === 'warning'
									? 'bg-warning/6 border-warning/20'
									: 'bg-info/6 border-info/20'
						].join(' ')}
					>
						{#if section.label}
							<p
								class={[
									lg ? 'text-sm' : 'text-xs',
									'font-semibold',
									section.type === 'error'
										? 'text-error'
										: section.type === 'warning'
											? 'text-warning'
											: 'text-info'
								].join(' ')}
							>
								{section.label}
							</p>
						{/if}
						<ul class={['mt-1 list-disc space-y-0.5 pl-4', lg ? 'text-sm' : 'text-xs'].join(' ')}>
							{#each section.items as item, j (j)}
								<li class={section.type === 'error' ? 'text-error' : 'text-base-content/80'}>
									{item}
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			{/each}
			{#if detailsHref}
				<div class="flex justify-end">
					<a
						href={(resolve as (p: string) => string)(detailsHref ?? '')}
						class="btn btn-ghost btn-xs gap-1 text-xs"
					>
						{detailsHrefLabel ?? 'View more details'}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="size-3"
							viewBox="0 0 20 20"
							fill="currentColor"
							aria-hidden="true"
						>
							<path
								fill-rule="evenodd"
								d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
								clip-rule="evenodd"
							/>
						</svg>
					</a>
				</div>
			{/if}
		</div>
	{/if}
{/if}

<!-- Modal details -->
{#if detailsMode === 'modal'}
	<dialog bind:this={detailsModal} class="modal">
		<div class="modal-box max-w-lg">
			<div class="mb-3 flex items-start justify-between gap-4">
				<h3 class="text-base font-semibold">Details</h3>
				<form method="dialog">
					<button class="btn btn-circle btn-ghost btn-outline btn-xs" aria-label="Close">✕</button>
				</form>
			</div>
			{#if result?.details}
				<div class="space-y-3">
					{#each result.details as section, i (i)}
						{#if section.items.length > 0}
							<div
								class={[
									'rounded-lg border px-3 py-2',
									section.type === 'error'
										? 'bg-error/6 border-error/20'
										: section.type === 'warning'
											? 'bg-warning/6 border-warning/20'
											: 'bg-info/6 border-info/20'
								].join(' ')}
							>
								{#if section.label}
									<p
										class={[
											'text-xs font-semibold',
											section.type === 'error'
												? 'text-error'
												: section.type === 'warning'
													? 'text-warning'
													: 'text-info'
										].join(' ')}
									>
										{section.label}
									</p>
								{/if}
								<ul class="mt-1 list-disc space-y-0.5 pl-4 text-xs">
									{#each section.items as item, j (j)}
										<li class={section.type === 'error' ? 'text-error' : 'text-base-content/80'}>
											{item}
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					{/each}
				</div>
			{/if}
			{#if detailsHref}
				<div class="mt-3 flex justify-end">
					<a
						href={(resolve as (p: string) => string)(detailsHref ?? '')}
						class="btn btn-ghost btn-xs gap-1 text-xs"
					>
						{detailsHrefLabel ?? 'View more details'}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="size-3"
							viewBox="0 0 20 20"
							fill="currentColor"
							aria-hidden="true"
						>
							<path
								fill-rule="evenodd"
								d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
								clip-rule="evenodd"
							/>
						</svg>
					</a>
				</div>
			{/if}
			<div class="modal-action">
				<form method="dialog">
					<button class="btn btn-ghost btn-sm">Close</button>
				</form>
			</div>
		</div>
		<form method="dialog" class="modal-backdrop">
			<button>close</button>
		</form>
	</dialog>
{/if}
