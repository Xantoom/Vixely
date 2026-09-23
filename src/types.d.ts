/** File System Access API: Chromium browsers only, so absent from the standard DOM types. */
interface SaveFilePickerOptions {
	suggestedName?: string;
	types?: { description?: string; accept: Record<string, string[]> }[];
}

interface Window {
	showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
}
