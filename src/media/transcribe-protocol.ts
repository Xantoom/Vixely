/** Whisper models offered, from quickest to most accurate. */
export type WhisperModel = 'tiny' | 'base' | 'small';

export interface TranscribeRequest {
	file: File;
	/** The sound track, by ID; null for the file's main one. */
	track: number | null;
	model: WhisperModel;
	/** Whisper's name of the language spoken (`french`); null to let it tell. */
	language: string | null;
}

export interface SpokenLine {
	/** Seconds of the source. */
	start: number;
	end: number;
	text: string;
}

export type TranscribeMessage =
	| { type: 'loading'; share: number }
	| { type: 'progress'; done: number; total: number; lines: SpokenLine[] }
	| { type: 'done' }
	| { type: 'error'; message: string };
