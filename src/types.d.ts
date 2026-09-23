/** File System Access API: Chromium browsers only, so absent from the standard DOM types. */
interface SaveFilePickerOptions {
	suggestedName?: string;
	types?: { description?: string; accept: Record<string, string[]> }[];
}

interface Window {
	showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
}

/** libheif compiled to WebAssembly (libheif-js), ES module build with the binary inlined. */
declare module 'libheif-js/libheif-wasm/libheif-bundle.mjs' {
	interface HeifImage {
		get_width(): number;
		get_height(): number;
		display(
			target: { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number },
			callback: (result: { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number } | null) => void,
		): void;
		free(): void;
	}
	interface HeifDecoder {
		decode(data: Uint8Array): HeifImage[];
	}
	interface LibHeif {
		HeifDecoder: new () => HeifDecoder;
	}
	export default function createLibHeif(options?: object): LibHeif | Promise<LibHeif>;
}

interface DirectoryPickerOptions {
	mode?: 'read' | 'readwrite';
	startIn?: 'desktop' | 'documents' | 'downloads' | 'pictures';
}

interface Window {
	showDirectoryPicker?: (options?: DirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>;
}
