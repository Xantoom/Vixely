/**
 * Files from a drop, including the contents of dropped folders, sorted by name. Hidden files
 * (`.DS_Store`, `._photo.jpg`) are left out.
 *
 * Entries must be taken synchronously inside the drop event; reading them can happen later.
 */
export async function filesFromDrop(data: DataTransfer): Promise<File[]> {
	const entries = [...data.items].map((item) => item.webkitGetAsEntry()).filter((entry) => entry !== null);
	if (entries.length === 0) return [...data.files];
	const files: File[] = [];
	await Promise.all(entries.map(async (entry) => walk(entry, files)));
	return files
		.filter((file) => !file.name.startsWith('.'))
		.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

// Chrome doesn't expose FileSystemFileEntry or FileSystemDirectoryEntry as globals: `instanceof`
// throws there, so entries are told apart by their flags.
function isFileEntry(entry: FileSystemEntry): entry is FileSystemFileEntry {
	return entry.isFile;
}

function isDirectoryEntry(entry: FileSystemEntry): entry is FileSystemDirectoryEntry {
	return entry.isDirectory;
}

async function walk(entry: FileSystemEntry, files: File[]): Promise<void> {
	if (isFileEntry(entry)) {
		files.push(
			await new Promise<File>((resolve, reject) => {
				entry.file(resolve, reject);
			}),
		);
		return;
	}
	if (!isDirectoryEntry(entry)) return;
	const reader = entry.createReader();
	// readEntries returns at most 100 entries per call; an empty batch means the folder is done.
	for (;;) {
		// oxlint-disable-next-line no-await-in-loop -- each call returns the next batch of the same folder
		const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
			reader.readEntries(resolve, reject);
		});
		if (batch.length === 0) return;
		// oxlint-disable-next-line no-await-in-loop -- the next batch is read once this one is walked
		await Promise.all(batch.map(async (child) => walk(child, files)));
	}
}
