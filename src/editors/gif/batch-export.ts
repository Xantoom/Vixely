import type { ItemStatus } from '@/editor/BatchList';
import type { FileDestination } from '@/media/file-destination';
import { outputName, uniqueName } from '@/media/save';
import type { BatchFile } from '@/media/session';
import { createGifDoc } from './document';
import { exportWithinLimit, FORMAT_FILES } from './export';
import { openAnimation } from './source';
import type { GifExportSettings } from './store';

export interface GifBatchJob {
	items: BatchFile[];
	settings: GifExportSettings;
	destination: FileDestination;
	signal: AbortSignal;
	onStatus: (id: number, status: ItemStatus) => void;
	/** Share of the whole batch done, from 0 to 1. */
	onProgress: (fraction: number) => void;
}

/**
 * Converts or optimizes the animations of a batch one after the other, each whole, with the same
 * export settings. A file that fails is marked and the batch goes on. Resolves with the number of
 * files exported.
 */
export async function exportGifBatch(job: GifBatchJob): Promise<number> {
	const { items, settings, signal } = job;
	const taken = new Set<string>();
	let exported = 0;
	for (const [index, item] of items.entries()) {
		if (signal.aborted) break;
		job.onStatus(item.id, 'working');
		try {
			// One file at a time: each holds all its frames in memory while it exports.
			// oxlint-disable-next-line no-await-in-loop
			const source = await openAnimation(item.file, item.format, () => {}, signal);
			try {
				// oxlint-disable-next-line no-await-in-loop
				const { blob } = await exportWithinLimit(
					{
						file: item.file,
						isGif: item.format === 'gif',
						source,
						doc: createGifDoc(source.duration, null),
						settings,
						signal,
						onProgress: (fraction) => {
							job.onProgress((index + (fraction ?? 1)) / items.length);
						},
					},
					() => {},
				);
				const extension =
					blob.type === 'video/webm'
						? 'webm'
						: blob.type === 'image/gif'
							? 'gif'
							: FORMAT_FILES[settings.format].extension;
				// oxlint-disable-next-line no-await-in-loop
				await job.destination.write(uniqueName(outputName(item.file.name, extension), taken), blob);
			} finally {
				source.dispose();
			}
			exported += 1;
			job.onStatus(item.id, 'done');
		} catch (error) {
			if (signal.aborted) break;
			console.error(error);
			job.onStatus(item.id, 'failed');
		}
	}
	await job.destination.finish();
	return exported;
}
