import { Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ItemStatus } from '@/editor/BatchList';
import { ExportAnnounce } from '@/editor/ExportAnnounce';
import { type FolderTargets, openFolderTargets } from '@/media/save-target';
import type { BatchFile } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/ui/Button';
import { exportVideoBatch } from './batch';
import { useVideoEditor } from './store';

/** Converts every video of the batch into a folder, one after the other. */
export function VideoBatchFooter({
	batch,
	onStatus,
	onRunning,
}: {
	batch: BatchFile[];
	onStatus: (id: number, status: ItemStatus | null) => void;
	onRunning: (running: boolean) => void;
}) {
	const settings = useVideoEditor((state) => state.exportSettings);
	const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
	const [progress, setProgress] = useState(0);
	const [exported, setExported] = useState(0);
	const abort = useRef<AbortController | null>(null);

	useEffect(() => {
		if (status !== 'saved') return;
		const timer = setTimeout(() => {
			setStatus('idle');
		}, 4000);
		return () => {
			clearTimeout(timer);
		};
	}, [status]);

	const run = async () => {
		if (!settings) return;
		let folder: FolderTargets | null;
		try {
			folder = await openFolderTargets('videos');
		} catch {
			return;
		}
		for (const item of batch) onStatus(item.id, null);
		const controller = new AbortController();
		abort.current = controller;
		setProgress(0);
		setStatus('saving');
		onRunning(true);
		try {
			const count = await exportVideoBatch({
				items: batch,
				settings,
				folder,
				signal: controller.signal,
				onStatus,
				onProgress: setProgress,
			});
			setExported(count);
			setStatus(controller.signal.aborted ? 'idle' : count > 0 ? 'saved' : 'failed');
		} catch {
			setStatus('failed');
		} finally {
			abort.current = null;
			onRunning(false);
		}
	};

	return (
		<>
			{status === 'saving' && (
				<div className="bg-surface-2 h-1 overflow-hidden rounded-full" aria-hidden="true">
					<div
						className="bg-ed h-full transition-[width] duration-200"
						style={{ width: `${progress * 100}%` }}
					/>
				</div>
			)}
			<div className="flex gap-2">
				<Button
					variant="primary"
					className="h-11 flex-1"
					disabled={!settings}
					busy={status === 'saving'}
					onClick={() => void run()}
				>
					{status === 'saving' ? (
						m.exporting_percent({ percent: Math.floor(progress * 100) })
					) : status === 'saved' ? (
						<>
							<Check size={17} strokeWidth={2.4} aria-hidden="true" />
							{m.batch_saved_audio({ count: exported })}
						</>
					) : (
						m.export_batch_audio_button({ count: batch.length })
					)}
				</Button>
				{status === 'saving' && (
					<Button className="h-11" onClick={() => abort.current?.abort()}>
						{m.stop()}
					</Button>
				)}
			</div>
			<ExportAnnounce status={status} />
			{status === 'failed' && (
				<p role="alert" className="text-small text-danger">
					{m.mux_failed()}
				</p>
			)}
		</>
	);
}
