import { create } from 'zustand';
import type { MediaKind } from '@/editors/registry';
import { identify } from './identify';
import type { MediaInfo } from './probe';

export type OpenError = { reason: 'unknown' | 'legacy' | 'read'; format?: string };

export interface OpenedFile {
	file: File;
	kind: MediaKind;
	format: string;
	/** Null when the file could be identified but not read further. */
	info: MediaInfo | null;
	poster: ImageBitmap | null;
}

interface SessionState {
	current: OpenedFile | null;
	/** File currently being read, shown while the drop is processed. */
	reading: string | null;
	error: OpenError | null;
	/** Reads the file and resolves with the editor that should open it, or null if it can't be opened. */
	open: (file: File) => Promise<MediaKind | null>;
	clearError: () => void;
}

/**
 * Containers such as MP4 or Matroska can hold audio only. Their signature says "video"; the tracks
 * inside decide.
 */
function editorFor(kind: MediaKind, info: MediaInfo | null): MediaKind {
	if (kind === 'video' && info && !info.video && info.audio) return 'audio';
	return kind;
}

export const useSession = create<SessionState>((set, get) => ({
	current: null,
	reading: null,
	error: null,

	async open(file) {
		set({ reading: file.name, error: null });
		const result = await identify(file);
		if (!result.ok) {
			set({ reading: null, error: { reason: result.reason, format: result.format } });
			return null;
		}

		const { kind, format } = result.value;
		let info: MediaInfo | null = null;
		let poster: ImageBitmap | null = null;
		try {
			// Mediabunny is only needed once a file is open, so it stays out of the first load.
			const { probe } = await import('./probe');
			({ info, poster } = await probe(file, kind, format));
		} catch {
			// The editor still opens and shows what is known: name, size and format.
		}

		// Another file may have been dropped while this one was being read.
		if (get().reading !== file.name) {
			poster?.close();
			return null;
		}

		get().current?.poster?.close();
		const editor = editorFor(kind, info);
		set({ reading: null, current: { file, kind: editor, format, info, poster } });
		return editor;
	},

	clearError() {
		set({ error: null });
	},
}));
