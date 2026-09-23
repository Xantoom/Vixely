import { BufferTarget, StreamTarget, type StreamTargetChunk, type Target } from 'mediabunny';
import { download, isPickerCancel } from './save';

/** Where an export is written while it is encoded, and how it becomes a file for the user. */
export interface SaveTarget {
	target: Target;
	/** Completes the file once the output is finalized. */
	commit: () => Promise<void>;
	/** Throws away what was written, after a failure or when the user stops the export. */
	discard: () => Promise<void>;
}

export interface SaveType {
	mime: string;
	extension: string;
	description: string;
}

/** Writes reach the disk in blocks of this size, not one small write per packet. */
const CHUNK_SIZE = 4 * 1024 * 1024;
const TEMPORARY_PREFIX = 'vixely-export-';

/**
 * Forwards writes to a file stream but never closes it: Mediabunny closes its stream when an
 * export is cancelled too, which would keep a partial file. Commit and discard decide instead.
 */
function forwardWrites(writable: FileSystemWritableFileStream): WritableStream<StreamTargetChunk> {
	return new WritableStream<StreamTargetChunk>({ write: async (chunk) => writable.write(chunk) });
}

/** Removes files left in private storage by earlier exports, once their download had time to start. */
async function removeLeftovers(root: FileSystemDirectoryHandle) {
	for await (const name of root.keys()) {
		if (name.startsWith(TEMPORARY_PREFIX)) await root.removeEntry(name).catch(() => undefined);
	}
}

/** Writes to a file the user chose, in place. `remove` deletes it if the export is thrown away. */
async function fileTarget(handle: FileSystemFileHandle, remove?: () => Promise<void>): Promise<SaveTarget> {
	const writable = await handle.createWritable();
	return {
		target: new StreamTarget(forwardWrites(writable), { chunked: true, chunkSize: CHUNK_SIZE }),
		commit: async () => writable.close(),
		discard: async () => {
			await writable.abort();
			await remove?.();
		},
	};
}

/**
 * A file that ends up in the downloads: written to the browser's private storage on disk first,
 * or built in memory when there is none (private browsing in some browsers).
 */
async function downloadTarget(name: string, type: SaveType): Promise<SaveTarget> {
	try {
		const root = await navigator.storage.getDirectory();
		await removeLeftovers(root);
		const entry = `${TEMPORARY_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`;
		const handle = await root.getFileHandle(entry, { create: true });
		const writable = await handle.createWritable();
		return {
			target: new StreamTarget(forwardWrites(writable), { chunked: true, chunkSize: CHUNK_SIZE }),
			commit: async () => {
				await writable.close();
				download(await handle.getFile(), name);
			},
			discard: async () => {
				await writable.abort();
				await root.removeEntry(entry);
			},
		};
	} catch {
		// No private storage: build the file in memory.
	}
	const target = new BufferTarget();
	return {
		target,
		commit: async () => {
			if (target.buffer) download(new Blob([target.buffer], { type: type.mime }), name);
			return Promise.resolve();
		},
		discard: async () => Promise.resolve(),
	};
}

/**
 * Opens the destination of an export before encoding starts, so a file of several gigabytes is
 * written as it is produced and never held in memory:
 *
 * - where the browser allows it (Chrome, Edge), the user picks the file and it is written in place;
 * - elsewhere, it is written to the browser's private storage on disk, then downloaded;
 * - as a last resort, it is built in memory, then downloaded.
 *
 * Must be called from the click that starts the export: the file picker needs it. Resolves with
 * null when the user closes the picker.
 */
export async function openSaveTarget(name: string, type: SaveType): Promise<SaveTarget | null> {
	if (window.showSaveFilePicker) {
		try {
			const handle = await window.showSaveFilePicker({
				suggestedName: name,
				types: [{ description: type.description, accept: { [type.mime]: [`.${type.extension}`] } }],
			});
			return await fileTarget(handle);
		} catch (error) {
			if (isPickerCancel(error)) return null;
			// Other failures (permissions, policy) fall back to a download.
		}
	}
	return downloadTarget(name, type);
}

/** Opens one destination per file of a batch. */
export type BatchDestination = (name: string, type: SaveType) => Promise<SaveTarget>;

/**
 * Where a batch goes: a folder the user picks where the browser allows it, written file by file;
 * otherwise every file is downloaded as it is ready. Must be called from the click that starts
 * the export. Resolves with null when the user closes the picker.
 */
export async function openBatchDestination(startIn: 'music' | 'pictures'): Promise<BatchDestination | null> {
	if (window.showDirectoryPicker) {
		try {
			const folder = await window.showDirectoryPicker({ mode: 'readwrite', startIn });
			return async (name) => {
				const handle = await folder.getFileHandle(name, { create: true });
				return fileTarget(handle, async () => folder.removeEntry(name));
			};
		} catch (error) {
			if (isPickerCancel(error)) return null;
		}
	}
	return downloadTarget;
}
