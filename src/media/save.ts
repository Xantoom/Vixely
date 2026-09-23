/** Name of an exported file: the original name with the new extension, marked when it would be the same. */
export function outputName(original: string, extension: string, aliases: readonly string[] = []): string {
	const dot = original.lastIndexOf('.');
	const base = dot > 0 ? original.slice(0, dot) : original;
	const current = dot > 0 ? original.slice(dot + 1).toLowerCase() : '';
	const same = current === extension || aliases.includes(current);
	return `${base}${same ? '-edited' : ''}.${extension}`;
}

/** Hands a file to the browser's downloads. */
export function download(blob: Blob, name: string) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = name;
	link.click();
	// The download reads the blob asynchronously; a minute is plenty to start it.
	setTimeout(() => {
		URL.revokeObjectURL(url);
	}, 60_000);
}

/** Whether an error means the user closed a file picker rather than something failing. */
export function isPickerCancel(error: unknown): boolean {
	return error instanceof DOMException && error.name === 'AbortError';
}
