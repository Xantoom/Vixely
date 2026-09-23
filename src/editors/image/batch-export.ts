import { zipSync } from 'fflate';
import type { BatchFile } from '@/media/session';
import { adaptDoc, type ImageDoc, type Size } from './document';
import { exportImage, exportName, saveFile } from './export';
import type { ExportSettings } from './store';

export type ItemStatus = 'working' | 'done' | 'failed';

/** Where exported files go: a folder picked once, or a ZIP built at the end. */
interface Destination {
	write: (name: string, blob: Blob) => Promise<void>;
	finish: () => Promise<void>;
}

async function folderDestination(): Promise<Destination | null> {
	if (!window.showDirectoryPicker) return null;
	let folder: FileSystemDirectoryHandle;
	try {
		folder = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'pictures' });
	} catch (error) {
		if (error instanceof DOMException && error.name === 'AbortError') throw error;
		return null;
	}
	return {
		async write(name, blob) {
			const handle = await folder.getFileHandle(name, { create: true });
			const writable = await handle.createWritable();
			await writable.write(blob);
			await writable.close();
		},
		async finish() {},
	};
}

function zipDestination(): Destination {
	const files: Record<string, Uint8Array> = {};
	return {
		async write(name, blob) {
			files[name] = new Uint8Array(await blob.arrayBuffer());
		},
		async finish() {
			// Images are already compressed: storing them is as small and much faster.
			const zip = zipSync(files, { level: 0 });
			await saveFile(new Blob([new Uint8Array(zip)], { type: 'application/zip' }), 'vixely-images.zip');
		},
	};
}

/** `photo.jpg`, then `photo (2).jpg`: two sources can map to the same output name. */
function uniqueName(name: string, taken: Set<string>): string {
	let candidate = name;
	const dot = name.lastIndexOf('.');
	for (let n = 2; taken.has(candidate.toLowerCase()); n += 1) {
		candidate = `${name.slice(0, dot)} (${n})${name.slice(dot)}`;
	}
	taken.add(candidate.toLowerCase());
	return candidate;
}

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
	const destination = (await folderDestination()) ?? zipDestination();
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
