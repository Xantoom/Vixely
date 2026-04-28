/** Re-encode a captured PNG frame to JPEG or WebP via an offscreen canvas. */
export async function convertPngToFormat(pngData: Uint8Array, format: 'jpeg' | 'webp'): Promise<Blob> {
	return new Promise((resolve, reject) => {
		const sourceBlob = new Blob([new Uint8Array(pngData)], { type: 'image/png' });
		const sourceUrl = URL.createObjectURL(sourceBlob);
		const img = new Image();
		img.onload = () => {
			const canvas = document.createElement('canvas');
			canvas.width = img.width;
			canvas.height = img.height;
			const ctx = canvas.getContext('2d');
			if (!ctx) {
				URL.revokeObjectURL(sourceUrl);
				reject(new Error('Canvas context unavailable'));
				return;
			}
			ctx.drawImage(img, 0, 0);
			canvas.toBlob(
				(blob) => {
					URL.revokeObjectURL(sourceUrl);
					if (!blob) {
						reject(new Error('Failed to encode frame'));
						return;
					}
					resolve(blob);
				},
				format === 'jpeg' ? 'image/jpeg' : 'image/webp',
				0.92,
			);
		};
		img.onerror = () => {
			URL.revokeObjectURL(sourceUrl);
			reject(new Error('Failed to decode frame'));
		};
		img.src = sourceUrl;
	});
}

/** Decide encode-thread budget from hardwareConcurrency (capped to [2, 8]). */
export function pickEncodeThreads(): number {
	const hc = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 0;
	if (!Number.isFinite(hc) || hc <= 0) return 2;
	return Math.min(Math.floor(hc / 2), 8);
}
