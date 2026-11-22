import { zipSync } from 'fflate';
import { saveFile } from '@/editors/image/export';
import { isPickerCancel } from './save';

/**
 * Where the files of a batch go when each one is made whole in memory (images, GIFs): a folder
 * picked once, or a ZIP saved at the end.
 */
export interface FileDestination {
	write: (name: string, blob: Blob) => Promise<void>;
	finish: () => Promise<void>;
}

async function folderDestination(startIn: 'pictures' | 'videos'): Promise<FileDestination | null> {
	if (!window.showDirectoryPicker) return null;
	let folder: FileSystemDirectoryHandle;
	try {
		folder = await window.showDirectoryPicker({ mode: 'readwrite', startIn });
	} catch (error) {
		if (isPickerCancel(error)) throw error;
		return null;
	}
	return {
		async write(name, blob) {
			const handle = await folder.getFileHandle(name, { create: true });
			const writable = await handle.createWritable();
			await writable.write(blob);
			await writable.close();
		},
		finish: async () => Promise.resolve(),
	};
}

function zipDestination(zipName: string): FileDestination {
	const files: Record<string, Uint8Array> = {};
	return {
		async write(name, blob) {
			files[name] = new Uint8Array(await blob.arrayBuffer());
		},
		async finish() {
			// The files are already compressed: storing them is as small and much faster.
			const zip = zipSync(files, { level: 0 });
			await saveFile(new Blob([new Uint8Array(zip)], { type: 'application/zip' }), zipName);
		},
	};
}

/**
 * A folder the user picks where the browser allows it (Chrome, Edge), a ZIP otherwise. Throws an
 * AbortError when the user closes the folder picker. Must be called from the click.
 */
export async function openFileDestination(startIn: 'pictures' | 'videos', zipName: string): Promise<FileDestination> {
	return (await folderDestination(startIn)) ?? zipDestination(zipName);
}
