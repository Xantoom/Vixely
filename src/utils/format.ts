/**
 * Locale-aware formatting utilities for file sizes, dimensions, and numbers.
 */

const locale = typeof navigator !== 'undefined' ? navigator.language : 'en-US';

/** Format bytes as human-readable file size (base-1024). */
export function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${formatNumber(bytes / 1024, 1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${formatNumber(bytes / (1024 * 1024), 1)} MB`;
	return `${formatNumber(bytes / (1024 * 1024 * 1024), 1)} GB`;
}

/** Format image dimensions as "W x H" with locale number separators. */
export function formatDimensions(w: number, h: number): string {
	return `${w.toLocaleString(locale)} × ${h.toLocaleString(locale)}`;
}

/** Generic locale number formatter. */
export function formatNumber(n: number, decimals?: number): string {
	return n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * Rough byte estimate for an exported image.
 * Used to show an approximate file size in the UI before actual export.
 */
export function estimateImageSize(w: number, h: number, format: 'png' | 'jpeg' | 'webp', quality: number): number {
	const pixels = w * h;
	switch (format) {
		case 'png':
			// PNG: ~3 bytes per pixel (compressed RGBA, depends heavily on content)
			return Math.round(pixels * 3);
		case 'jpeg': {
			// JPEG: quality 1-100 maps roughly to 0.2 - 2.5 bytes/pixel
			const bpp = 0.2 + (quality / 100) * 2.3;
			return Math.round(pixels * bpp);
		}
		case 'webp': {
			// WebP: slightly smaller than JPEG at same quality
			const bpp = 0.15 + (quality / 100) * 1.8;
			return Math.round(pixels * bpp);
		}
	}
}
