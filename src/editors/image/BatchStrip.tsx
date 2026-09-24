import { Check, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { type BatchFile, useSession } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import type { ItemStatus } from './batch-export';

/** Thumbnails are decoded two at a time: hundreds of photos at once would exhaust memory. */
const THUMBNAIL_CONCURRENCY = 2;
let running = 0;
const queue: (() => void)[] = [];

async function thumbnail(item: BatchFile): Promise<ImageBitmap | null> {
	if (running >= THUMBNAIL_CONCURRENCY) await new Promise<void>((resolve) => queue.push(resolve));
	running += 1;
	const size = { resizeHeight: 128, resizeQuality: 'medium' } as const;
	try {
		return await createImageBitmap(item.file, size);
	} catch {
		// HEIC, TIFF or JPEG XL: decoded like the preview, then scaled down.
		const { decodeStill } = await import('@/media/probe');
		const full = await decodeStill(item.file, item.format);
		if (!full) return null;
		const small = await createImageBitmap(full, size);
		full.close();
		return small;
	} finally {
		running -= 1;
		queue.shift()?.();
	}
}

function Thumb({ item }: { item: BatchFile }) {
	const ref = useRef<HTMLCanvasElement>(null);
	const [failed, setFailed] = useState(false);
	useEffect(() => {
		let cancelled = false;
		void thumbnail(item).then((bitmap) => {
			const canvas = ref.current;
			if (cancelled || !canvas || !bitmap) {
				bitmap?.close();
				if (!bitmap && !cancelled) setFailed(true);
				return;
			}
			canvas.width = bitmap.width;
			canvas.height = bitmap.height;
			canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
			bitmap.close();
		});
		return () => {
			cancelled = true;
		};
	}, [item]);
	return failed ? (
		<span className="text-caption text-muted grid size-full place-items-center font-mono uppercase">
			{item.format}
		</span>
	) : (
		<canvas ref={ref} className="size-full object-cover" />
	);
}

function StatusMark({ status }: { status: ItemStatus | undefined }) {
	if (status === 'working') return <span className="bg-ed-soft absolute inset-0 animate-pulse" aria-hidden="true" />;
	if (status === 'done') {
		return (
			<span
				className="bg-ed text-ed-ink absolute right-1 bottom-1 grid size-5 place-items-center rounded-full"
				aria-hidden="true"
			>
				<Check size={12} strokeWidth={3} />
			</span>
		);
	}
	if (status === 'failed') {
		return (
			<span
				className="bg-danger absolute right-1 bottom-1 grid size-5 place-items-center rounded-full text-white"
				aria-hidden="true"
			>
				<X size={12} strokeWidth={3} />
			</span>
		);
	}
	return null;
}

/**
 * The images of a batch, under the preview. The one shown in the preview is the one being edited;
 * its edits apply to all of them.
 */
export function BatchStrip({ statuses, locked }: { statuses: ReadonlyMap<number, ItemStatus>; locked: boolean }) {
	const batch = useSession((state) => state.batch) ?? [];
	const current = useSession((state) => state.current);
	const select = useSession((state) => state.select);
	const remove = useSession((state) => state.removeFromBatch);
	const add = useSession((state) => state.addToBatch);
	const error = useSession((state) => state.error);
	const inputRef = useRef<HTMLInputElement>(null);

	return (
		<section aria-label={m.batch_label()} className="border-line grid gap-2.5 border-t px-4 pt-3 pb-4">
			<div className="flex items-center justify-between gap-3">
				<span className="text-ui">
					<span className="font-semibold">{m.batch_count({ count: batch.length })}</span>
				</span>
				<button
					type="button"
					disabled={locked}
					onClick={() => inputRef.current?.click()}
					className="text-ui text-ink-2 enabled:hover:bg-surface enabled:hover:text-ink flex h-8 items-center gap-1.5 rounded-sm px-2.5 font-medium transition-colors disabled:opacity-40"
				>
					<Plus size={15} aria-hidden="true" />
					{m.batch_add()}
				</button>
				<input
					ref={inputRef}
					type="file"
					accept="image/*,.heic,.heif,.jxl,.tif,.tiff"
					multiple
					className="hidden"
					tabIndex={-1}
					onChange={(event) => {
						void add([...(event.target.files ?? [])]);
						event.target.value = '';
					}}
				/>
			</div>
			{error?.reason === 'skipped' && (
				<p className="text-small text-muted -mt-1">{m.batch_skipped({ count: error.count })}</p>
			)}
			<ol className="flex gap-2 overflow-x-auto pb-1">
				{batch.map((item) => {
					const selected = current?.file === item.file;
					return (
						<li key={item.id} className="group relative flex-none">
							<button
								type="button"
								onClick={() => void select(item)}
								aria-current={selected}
								title={item.file.name}
								className={`bg-surface-2 relative block h-16 w-24 overflow-hidden rounded-xs transition-shadow ${
									selected ? 'shadow-[0_0_0_2px_var(--ed)]' : 'hover:shadow-[0_0_0_2px_var(--line-2)]'
								}`}
							>
								<Thumb item={item} />
								<StatusMark status={statuses.get(item.id)} />
							</button>
							{!locked && batch.length > 1 && (
								<button
									type="button"
									aria-label={m.batch_remove({ name: item.file.name })}
									onClick={() => {
										remove(item.id);
									}}
									className="bg-bg text-ink-2 hover:text-ink absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full opacity-0 shadow-[0_0_0_1px_var(--line-2)] transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
								>
									<X size={12} strokeWidth={2.5} />
								</button>
							)}
						</li>
					);
				})}
			</ol>
		</section>
	);
}
