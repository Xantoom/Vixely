import { Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PhotoMetadata } from '@/media/probe';
import type { BatchFile } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/ui/Button';
import { exportBatch, type ItemStatus } from './batch-export';
import { orientedSize } from './document';
import { exportImage, exportName, saveFile } from './export';
import { cropRatio, useImageDoc, useImageEditor } from './store';

/** How long the button confirms a save before going back to its normal label. */
const SAVED_FEEDBACK = 2500;

interface ExportFooterProps {
	source: ImageBitmap;
	file: File;
	photo: PhotoMetadata | null;
	/** Set in batch mode: every image is exported with the same edits. */
	batch: BatchFile[] | null;
	onStatus: (id: number, status: ItemStatus | null) => void;
	onRunning: (running: boolean) => void;
}

export function ExportFooter({ source, file, photo, batch, onStatus, onRunning }: ExportFooterProps) {
	const doc = useImageDoc();
	const settings = useImageEditor((state) => state.exportSettings);
	const aspect = useImageEditor((state) => state.cropAspect);
	const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
	const [progress, setProgress] = useState({ done: 0, total: 0, exported: 0 });
	const abort = useRef<AbortController | null>(null);

	useEffect(() => {
		if (status !== 'saved') return;
		const timer = setTimeout(() => {
			setStatus('idle');
		}, SAVED_FEEDBACK);
		return () => {
			clearTimeout(timer);
		};
	}, [status]);

	const saveOne = async () => {
		setStatus('saving');
		try {
			const blob = await exportImage(source, doc, settings, photo);
			setStatus((await saveFile(blob, exportName(file.name, settings.format))) ? 'saved' : 'idle');
		} catch {
			setStatus('failed');
		}
	};

	const saveAll = async (items: BatchFile[]) => {
		for (const item of items) onStatus(item.id, null);
		const controller = new AbortController();
		abort.current = controller;
		setStatus('saving');
		setProgress({ done: 0, total: items.length, exported: 0 });
		onRunning(true);
		try {
			const exported = await exportBatch({
				items,
				doc,
				editedSize: { width: source.width, height: source.height },
				ratio: cropRatio(aspect, orientedSize(source, doc.rotation)),
				settings,
				signal: controller.signal,
				onStatus: (id, itemStatus) => {
					onStatus(id, itemStatus);
					if (itemStatus !== 'working') setProgress((p) => ({ ...p, done: p.done + 1 }));
				},
			});
			setProgress((p) => ({ ...p, exported }));
			setStatus(exported > 0 ? 'saved' : 'failed');
		} catch {
			// The user closed the folder picker: nothing was written.
			setStatus('idle');
		} finally {
			onRunning(false);
			abort.current = null;
		}
	};

	const label = () => {
		if (status === 'saving') {
			return batch
				? m.exporting_progress({ done: Math.min(progress.done + 1, progress.total), total: progress.total })
				: m.exporting();
		}
		if (status === 'saved') {
			return (
				<>
					<Check size={17} strokeWidth={2.4} aria-hidden="true" />
					{batch ? m.batch_saved({ count: progress.exported }) : m.saved()}
				</>
			);
		}
		return batch ? m.export_batch_button({ count: batch.length }) : m.export_image_button();
	};

	return (
		<>
			{batch && status === 'saving' && (
				<div className="bg-surface-2 h-1 overflow-hidden rounded-full" aria-hidden="true">
					<div
						className="bg-ed h-full transition-[width] duration-300"
						style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }}
					/>
				</div>
			)}
			<div className="flex gap-2">
				<Button
					variant="primary"
					className="h-11 flex-1"
					onClick={() => void (batch ? saveAll(batch) : saveOne())}
					disabled={status === 'saving'}
				>
					{label()}
				</Button>
				{batch && status === 'saving' && (
					<Button className="h-11" onClick={() => abort.current?.abort()}>
						{m.stop()}
					</Button>
				)}
			</div>
			{status === 'failed' && (
				<p role="alert" className="text-small text-danger">
					{m.export_failed()}
				</p>
			)}
		</>
	);
}
