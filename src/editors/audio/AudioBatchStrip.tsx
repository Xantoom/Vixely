import { Check, Plus, X } from 'lucide-react';
import { useRef } from 'react';
import { useSession } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import type { ItemStatus } from './batch-export';

function StatusMark({ status }: { status: ItemStatus | undefined }) {
	if (status === 'working')
		return <span className="bg-ed size-2 flex-none animate-pulse rounded-full" aria-hidden="true" />;
	if (status === 'done')
		return <Check size={14} strokeWidth={2.6} className="text-ed-text flex-none" aria-hidden="true" />;
	if (status === 'failed')
		return <X size={14} strokeWidth={2.6} className="text-danger flex-none" aria-hidden="true" />;
	return null;
}

/**
 * The files of an audio batch, above the timeline. The one shown in the timeline is the one being
 * listened to; volume, fades and export settings apply to all of them.
 */
export function AudioBatchStrip({ statuses, locked }: { statuses: ReadonlyMap<number, ItemStatus>; locked: boolean }) {
	const batch = useSession((state) => state.batch) ?? [];
	const current = useSession((state) => state.current);
	const select = useSession((state) => state.select);
	const remove = useSession((state) => state.removeFromBatch);
	const add = useSession((state) => state.addToBatch);
	const error = useSession((state) => state.error);
	const inputRef = useRef<HTMLInputElement>(null);

	return (
		<section aria-label={m.batch_label()} className="border-line grid gap-2 border-t px-4 pt-3 pb-1">
			<div className="flex items-center justify-between gap-3">
				<span className="text-ui">
					<span className="font-semibold">{m.batch_count_audio({ count: batch.length })}</span>{' '}
					<span className="text-muted max-sm:hidden">{m.batch_hint_audio()}</span>
				</span>
				<button
					type="button"
					disabled={locked}
					onClick={() => inputRef.current?.click()}
					className="text-ui text-ink-2 enabled:hover:bg-surface enabled:hover:text-ink flex h-8 flex-none items-center gap-1.5 rounded-sm px-2.5 font-medium transition-colors disabled:opacity-40"
				>
					<Plus size={15} aria-hidden="true" />
					{m.batch_add_audio()}
				</button>
				<input
					ref={inputRef}
					type="file"
					accept="audio/*,video/*,.mka,.mkv,.opus,.flac"
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
			<ol className="flex gap-1.5 overflow-x-auto pb-2">
				{batch.map((item) => {
					const selected = current?.file === item.file;
					return (
						<li key={item.id} className="group relative flex-none">
							<button
								type="button"
								onClick={() => void select(item)}
								aria-current={selected}
								title={item.file.name}
								className={`text-ui flex h-8 max-w-56 items-center gap-2 rounded-sm px-3 transition-colors ${
									selected
										? 'bg-ed-soft text-ed-text font-medium'
										: 'text-ink-2 hover:bg-surface hover:text-ink shadow-[inset_0_0_0_1px_var(--line)]'
								}`}
							>
								<span className="truncate">{item.file.name}</span>
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
