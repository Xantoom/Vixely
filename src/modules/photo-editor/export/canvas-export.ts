import type { FilterParams } from '@/modules/shared-core/types/filters.ts';
import type { PhotoWebGLRenderer } from '../render/webgl-renderer.ts';

export type ExportFormat = 'png' | 'jpeg' | 'webp';

interface ExportOptions {
	format: ExportFormat;
	quality: number;
}

/**
 * Export the current WebGL-rendered image as a Blob.
 * Renders with current filters, then converts canvas to blob.
 */
export function exportCanvasToBlob(
	renderer: PhotoWebGLRenderer,
	params: FilterParams,
	options: ExportOptions,
): Promise<Blob> {
	renderer.render(params);

	const canvas = renderer.canvas;
	const mimeType = `image/${options.format}`;
	const quality = options.format === 'png' ? undefined : options.quality / 100;

	if (canvas instanceof OffscreenCanvas) {
		return canvas.convertToBlob({ type: mimeType, quality });
	}

	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (blob) resolve(blob);
				else reject(new Error('Failed to create blob'));
			},
			mimeType,
			quality,
		);
	});
}
