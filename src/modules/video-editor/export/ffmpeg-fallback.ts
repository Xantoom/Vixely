/**
 * Browser capability helpers for deciding when to use the Mediabunny conversion path.
 */

export interface FfmpegExportOptions {
	file: File;
	outputFilename: string;
	ffmpegArgs: string[];
	onProgress?: (progress: number) => void;
}

/**
 * Check if WebCodecs VideoEncoder is available in the current browser.
 */
export function isWebCodecsSupported(): boolean {
	return typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined';
}

/**
 * Check if WebCodecs VideoDecoder is available (for playback).
 */
export function isWebCodecsDecoderSupported(): boolean {
	return typeof VideoDecoder !== 'undefined';
}
