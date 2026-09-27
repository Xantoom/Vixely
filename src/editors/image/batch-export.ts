import { openFileDestination } from '@/media/file-destination';
import { uniqueName } from '@/media/save';
import type { BatchFile } from '@/media/session';
import { adaptDoc, type ImageDoc, type Size } from './document';
import { exportImage, exportName } from './export';
import type { ExportSettings } from './store';

export type ItemStatus = 'working' | 'done' | 'failed';

export interface BatchJob {
	items: BatchFile[];
	doc: ImageDoc;
	/** Size of the image the document was edited on. */
	editedSize: Size;
	ratio: number | null;
	settings: ExportSettings;
	/** Each image's progress; once done, the weights of its file before and after. */
	onStatus: (id: number, status: ItemStatus, weights?: { before: number; after: number }) => void;
	signal: AbortSignal;
}

/** Images worked on at once: one is drawn while the other is encoded, and memory stays flat. */
const CONCURRENCY = 2;

/**
 * Exports every image of a batch with the same edits and settings, two at a time so memory stays
 * flat whatever the number of photos. Each image keeps its own metadata.
 * Resolves with the number of images exported.
 */
export async function exportBatch({
	items,
	doc,
	editedSize,
	ratio,
	settings,
	onStatus,
	signal,
}: BatchJob): Promise<number> {
	const destination = await openFileDestination('pictures', 'vixely-images.zip');
	const { decodeStill, readPhotoMetadata } = await import('@/media/probe');
	const taken = new Set<string>();
	let exported = 0;

	const queue = [...items];
	const worker = async () => {
		for (let item = queue.shift(); item && !signal.aborted; item = queue.shift()) {
			onStatus(item.id, 'working');
			try {
				// oxlint-disable-next-line no-await-in-loop -- a few images at a time keeps memory flat
				const [bitmap, photo] = await Promise.all([
					decodeStill(item.file, item.format),
					readPhotoMetadata(item.file),
				]);
				if (!bitmap) throw new Error('Unreadable image');
				const itemDoc = adaptDoc(doc, editedSize, bitmap, ratio);
				// oxlint-disable-next-line no-await-in-loop
				const blob = await exportImage(bitmap, itemDoc, settings, photo).finally(() => {
					bitmap.close();
				});
				// oxlint-disable-next-line no-await-in-loop
				await destination.write(uniqueName(exportName(item.file.name, settings.format), taken), blob);
				exported += 1;
				onStatus(item.id, 'done', { before: item.file.size, after: blob.size });
			} catch {
				onStatus(item.id, 'failed');
			}
		}
	};
	await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));

	if (exported > 0) await destination.finish();
	return exported;
}
