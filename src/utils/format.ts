/**
 * Locale-aware formatting utilities for file sizes, dimensions, and numbers.
 */

export const USER_LOCALE = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US';

/** Format bytes as human-readable file size (base-1024). */
export function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${formatNumber(bytes / 1024, 1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${formatNumber(bytes / (1024 * 1024), 1)} MB`;
	return `${formatNumber(bytes / (1024 * 1024 * 1024), 1)} GB`;
}

/** Format image dimensions as "W x H" with locale number separators. */
export function formatDimensions(w: number, h: number): string {
	return `${w.toLocaleString(USER_LOCALE)} × ${h.toLocaleString(USER_LOCALE)}`;
}

/** Generic locale number formatter. */
export function formatNumber(n: number, decimals?: number): string {
	return n.toLocaleString(USER_LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Format date/time with the user's locale. */
export function formatDateTime(value: Date | number, options?: Intl.DateTimeFormatOptions): string {
	const date = value instanceof Date ? value : new Date(value);
	return date.toLocaleString(USER_LOCALE, options);
}

/**
 * Rough byte estimate for an exported image.
 * Uses empirical bytes-per-pixel ratios adjusted by format and quality.
 */
export function estimateImageSize(w: number, h: number, format: 'png' | 'jpeg' | 'webp', quality: number): number {
	const pixels = w * h;
	switch (format) {
		case 'png':
			// PNG: ~2-4 bytes/pixel depending on content; use 2.5 as middle ground
			return Math.round(pixels * 2.5);
		case 'jpeg': {
			// JPEG: quality 1-100 maps roughly to 0.15 - 1.8 bytes/pixel
			const bpp = 0.15 + (quality / 100) * 1.65;
			return Math.round(pixels * bpp);
		}
		case 'webp': {
			// WebP: ~15-20% smaller than JPEG at same quality
			const bpp = 0.12 + (quality / 100) * 1.4;
			return Math.round(pixels * bpp);
		}
	}
}

/**
 * Estimate output size for a video export.
 * Uses CRF → approximate bitrate mapping per codec, plus audio track.
 */
export function estimateVideoSize(opts: {
	durationSec: number;
	width: number;
	height: number;
	fps: number;
	codec: string;
	rateControl: string;
	crf: number;
	targetBitrateKbps: number;
	audioBitrateKbps: number;
	includeAudio: boolean;
}): number {
	let videoBitrateKbps: number;

	if (opts.rateControl === 'bitrate') {
		videoBitrateKbps = opts.targetBitrateKbps;
	} else {
		// CRF → approximate bitrate based on resolution and codec
		const pixels = opts.width * opts.height;
		const pixelRate = pixels * opts.fps;

		// Base bits-per-pixel-per-frame adjusted by codec efficiency
		const codecEfficiency: Record<string, number> = {
			libx264: 1.0,
			libx265: 0.6,
			'libvpx-vp9': 0.55,
			'libaom-av1': 0.45,
		};
		const efficiency = codecEfficiency[opts.codec] ?? 1.0;

		// CRF 23 is "visually transparent" for H.264 → ~0.1 bits/pixel at 1080p30
		// Each CRF step ≈ 12% change in bitrate
		const crfRef = opts.codec === 'libx265' ? 28 : 23;
		const crfDelta = opts.crf - crfRef;
		const crfFactor = Math.pow(0.88, crfDelta);

		const baseBpp = 0.1 * efficiency * crfFactor;
		videoBitrateKbps = (pixelRate * baseBpp) / 1000;
	}

	const audioBitrateKbps = opts.includeAudio ? opts.audioBitrateKbps : 0;
	const totalKbps = videoBitrateKbps + audioBitrateKbps;
	return Math.round((totalKbps * opts.durationSec * 1000) / 8);
}

/**
 * Estimate output size for a GIF.
 * Based on frame count, dimensions, and color/quality settings.
 */
export function estimateGifSize(opts: {
	frames: number;
	width: number;
	height: number;
	maxColors: number;
	compressionSpeed: number;
}): number {
	const pixelsPerFrame = opts.width * opts.height;
	// GIF uses LZW compression. At 256 colors, ~0.5-2 bytes/pixel after compression.
	// Fewer colors → better compression. Higher compression speed → larger files.
	const colorFactor = Math.log2(Math.max(2, opts.maxColors)) / 8; // 0.125 (2 colors) - 1.0 (256)
	const qualityFactor = 0.3 + (opts.compressionSpeed / 30) * 0.7; // faster = larger
	const bpp = 0.4 * colorFactor * qualityFactor;
	return Math.round(opts.frames * pixelsPerFrame * bpp);
}
