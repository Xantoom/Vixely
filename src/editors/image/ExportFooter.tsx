import { Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ExportAnnounce } from '@/editor/ExportAnnounce';
import { formatBytes, formatPercent } from '@/lib/format';
import type { PhotoMetadata } from '@/media/probe';
import type { BatchFile } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/ui/Button';
import { exportBatch, type ItemStatus } from './batch-export';
import { type ImageDoc, orientedSize } from './document';
import { exportImage, exportName, saveFile } from './export';
import type { ExportSettings, ImageFormat } from './store';
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

/** The name of each format on the button, as people know them. */
const FORMAT_NAMES: Record<ImageFormat, string> = {
	jpeg: 'JPEG',
	png: 'PNG',
	webp: 'WebP',
	avif: 'AVIF',
	jxl: 'JPEG XL',
	bmp: 'BMP',
	tiff: 'TIFF',
	ico: 'ICO',
};

/** How long the settings stay still before the file size is worked out again. */
const ESTIMATE_DELAY = 600;

/** `−35%` or `+12%` (`−35 %` in French): how much bigger or smaller than the original. */
function change(before: number, after: number): string {
	return `${after <= before ? '−' : '+'}${formatPercent(Math.abs(Math.round((1 - after / before) * 100)))}`;
}

/** A file encoded in the background, with what it was made from. */
interface Estimate {
	blob: Blob;
	source: ImageBitmap;
	doc: ImageDoc;
	settings: ExportSettings;
	photo: PhotoMetadata | null;
}

/**
 * The file the export will save, encoded in the background once the settings stop moving: its
 * size shows, and saving it with nothing changed takes it as it is rather than encoding it again.
 * One encoding at a time; one overtaken by a change stops at its next step.
 */
function useEstimate(
	source: ImageBitmap,
	doc: ImageDoc,
	settings: ExportSettings,
	photo: PhotoMetadata | null,
	on: boolean,
): Estimate | null {
	const [estimate, setEstimate] = useState<Estimate | null>(null);
	const running = useRef<AbortController | null>(null);
	useEffect(() => {
		if (!on) return;
		const timer = setTimeout(() => {
			running.current?.abort();
			const controller = new AbortController();
			running.current = controller;
			void exportImage(source, doc, settings, photo, controller.signal).then(
				(blob) => {
					if (!controller.signal.aborted) setEstimate({ blob, source, doc, settings, photo });
				},
				() => {
					if (!controller.signal.aborted) setEstimate(null);
				},
			);
		}, ESTIMATE_DELAY);
		return () => {
			clearTimeout(timer);
			// Anything changed, or the panel closed: the encoding under way is no longer wanted.
			running.current?.abort();
			running.current = null;
		};
	}, [source, doc, settings, photo, on]);
	// Only while it matches what is set.
	return estimate &&
		estimate.source === source &&
		estimate.doc === doc &&
		estimate.settings === settings &&
		estimate.photo === photo
		? estimate
		: null;
}

export function ExportFooter({ source, file, photo, batch, onStatus, onRunning }: ExportFooterProps) {
	const doc = useImageDoc();
	const settings = useImageEditor((state) => state.exportSettings);
	const aspect = useImageEditor((state) => state.cropAspect);
	const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
	const [progress, setProgress] = useState({ done: 0, total: 0, exported: 0 });
	/** Weights of the files before and after the last export, to show what was saved. */
	const [weights, setWeights] = useState<{ before: number; after: number } | null>(null);
	const abort = useRef<AbortController | null>(null);
	const estimate = useEstimate(source, doc, settings, photo, batch === null);

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
		setWeights(null);
		try {
			// Encoded already for the estimate, with nothing changed since: saved as it is.
			const blob = estimate?.blob ?? (await exportImage(source, doc, settings, photo));
			setWeights({ before: file.size, after: blob.size });
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
		setWeights({ before: 0, after: 0 });
		onRunning(true);
		try {
			const exported = await exportBatch({
				items,
				doc,
				editedSize: { width: source.width, height: source.height },
				ratio: cropRatio(aspect, orientedSize(source, doc.rotation)),
				settings,
				signal: controller.signal,
				onStatus: (id, itemStatus, itemWeights) => {
					onStatus(id, itemStatus);
					if (itemWeights)
						setWeights((total) => ({
							before: (total?.before ?? 0) + itemWeights.before,
							after: (total?.after ?? 0) + itemWeights.after,
						}));
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
		return batch
			? m.export_batch_button({ count: batch.length })
			: m.export_as({ format: FORMAT_NAMES[settings.format] });
	};

	return (
		<>
			{!batch && status !== 'saving' && (
				<p className="text-small text-fg-faint x-tabular text-center" aria-live="polite">
					{estimate === null
						? m.weight_estimating()
						: m.weight_estimate({
								after: formatBytes(estimate.blob.size),
								change: change(file.size, estimate.blob.size),
							})}
				</p>
			)}
			{batch && status === 'saving' && (
				<div className="bg-sunken-2 h-1 overflow-hidden rounded-full" aria-hidden="true">
					<div
						className="bg-ed h-full origin-left transition-transform duration-300 motion-reduce:transition-none"
						style={{ transform: `scaleX(${progress.done / Math.max(progress.total, 1)})` }}
					/>
				</div>
			)}
			<div className="flex gap-2">
				<Button
					variant="primary"
					className="h-11 flex-1"
					onClick={() => void (batch ? saveAll(batch) : saveOne())}
					busy={status === 'saving'}
				>
					{label()}
				</Button>
				{batch && status === 'saving' && (
					<Button className="h-11" onClick={() => abort.current?.abort()}>
						{m.stop()}
					</Button>
				)}
			</div>
			<ExportAnnounce status={status} />
			{batch && weights && weights.after > 0 && status !== 'saving' && (
				<p className="text-small text-fg-faint x-tabular text-center">
					{m.weight_change({
						before: formatBytes(weights.before),
						after: formatBytes(weights.after),
						change: change(weights.before, weights.after),
					})}
				</p>
			)}
			{weights && settings.maxKb !== null && weights.after > settings.maxKb * 1000 && status !== 'saving' && (
				<p role="status" className="text-small text-danger text-center">
					{m.weight_over_limit({ limit: formatBytes(settings.maxKb * 1000) })}
				</p>
			)}
			{status === 'failed' && (
				<p role="alert" className="text-small text-danger">
					{m.export_failed()}
				</p>
			)}
		</>
	);
}
