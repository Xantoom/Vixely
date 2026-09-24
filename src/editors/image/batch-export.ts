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
	onStatus: (id: number, status: ItemStatus) => void;
	signal: AbortSignal;
}

/**
 * Exports every image of a batch with the same edits and settings, one at a time so memory
 * stays flat whatever the number of photos. Each image keeps its own metadata.
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

	for (const item of items) {
		if (signal.aborted) break;
		onStatus(item.id, 'working');
		try {
			// oxlint-disable-next-line no-await-in-loop -- one image at a time keeps memory flat
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
			onStatus(item.id, 'done');
		} catch {
			onStatus(item.id, 'failed');
		}
	}

	if (exported > 0) await destination.finish();
	return exported;
}
