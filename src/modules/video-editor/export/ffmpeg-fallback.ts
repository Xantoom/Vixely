/**
 * FFmpeg fallback export path.
 * Used when WebCodecs doesn't support the target codec (e.g., H.265/libx265)
 * or when the browser doesn't support WebCodecs (Firefox).
 *
 * This delegates to the existing ffmpeg-worker.ts infrastructure.
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
