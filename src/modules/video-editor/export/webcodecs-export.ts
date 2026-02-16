import {
	ALL_FORMATS,
	BlobSource,
	BufferTarget,
	Conversion,
	Input,
	MkvOutputFormat,
	Mp4OutputFormat,
	Output,
	WebMOutputFormat,
	type ConversionVideoOptions,
} from 'mediabunny';
import type { FilterParams } from '@/modules/shared-core/types/filters.ts';
import type { ContainerFormat } from '../encode/muxer.ts';
import type { VideoCodec } from '../encode/webcodecs-encoder.ts';

export interface WebCodecsExportOptions {
	file: File;
	filters: FilterParams;
	codec: VideoCodec;
	container: ContainerFormat;
	width: number;
	height: number;
	bitrate?: number;
	trimStart?: number;
	trimEnd?: number;
	onProgress?: (progress: number) => void;
}

function toOutputFormat(container: ContainerFormat): Mp4OutputFormat | WebMOutputFormat | MkvOutputFormat {
	switch (container) {
		case 'webm':
			return new WebMOutputFormat();
		case 'mkv':
			return new MkvOutputFormat();
		case 'mp4':
		default:
			return new Mp4OutputFormat({ fastStart: false });
	}
}

function toMediabunnyCodec(codec: VideoCodec): ConversionVideoOptions['codec'] {
	switch (codec) {
		case 'avc1':
			return 'avc';
		case 'vp09':
			return 'vp9';
		case 'av01':
		default:
			return 'av1';
	}
}

function createVideoProcess(filters: FilterParams): ConversionVideoOptions['process'] | undefined {
	const filterTokens: string[] = [];
	if (Math.abs(filters.exposure - 1) > 1e-4) {
		filterTokens.push(`brightness(${Math.max(0, filters.exposure) * 100}%)`);
	}
	if (Math.abs(filters.brightness) > 1e-4) {
		filterTokens.push(`brightness(${Math.max(0, 1 + filters.brightness) * 100}%)`);
	}
	if (Math.abs(filters.contrast - 1) > 1e-4) {
		filterTokens.push(`contrast(${Math.max(0, filters.contrast) * 100}%)`);
	}
	if (Math.abs(filters.saturation - 1) > 1e-4) {
		filterTokens.push(`saturate(${Math.max(0, filters.saturation) * 100}%)`);
	}
	if (Math.abs(filters.hue) > 1e-4) {
		filterTokens.push(`hue-rotate(${filters.hue}deg)`);
	}
	if (Math.abs(filters.blur) > 1e-4) {
		filterTokens.push(`blur(${Math.max(0, filters.blur)}px)`);
	}
	if (Math.abs(filters.sepia) > 1e-4) {
		filterTokens.push(`sepia(${Math.max(0, filters.sepia) * 100}%)`);
	}

	if (filterTokens.length === 0) return undefined;

	let canvas: OffscreenCanvas | null = null;
	let ctx: OffscreenCanvasRenderingContext2D | null = null;
	const filterText = filterTokens.join(' ');

	return (sample) => {
		const width = Math.max(1, Math.round((sample as { displayWidth?: number }).displayWidth ?? 1));
		const height = Math.max(1, Math.round((sample as { displayHeight?: number }).displayHeight ?? 1));
		if (!canvas || canvas.width !== width || canvas.height !== height) {
			canvas = new OffscreenCanvas(width, height);
			ctx = canvas.getContext('2d', { alpha: true });
		}
		if (!canvas || !ctx) return sample;
		ctx.save();
		ctx.clearRect(0, 0, width, height);
		ctx.filter = filterText;
		(sample as { draw: (context: OffscreenCanvasRenderingContext2D, x: number, y: number) => void }).draw(
			ctx,
			0,
			0,
		);
		ctx.restore();
		return canvas;
	};
}

/**
 * Mediabunny-backed export pipeline.
 */
export async function exportWithWebCodecs(options: WebCodecsExportOptions): Promise<Blob> {
	const { file, filters, codec, container, width, height, bitrate, trimStart = 0, trimEnd, onProgress } = options;

	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });

	try {
		const outputFormat = toOutputFormat(container);
		const output = new Output({ format: outputFormat, target: new BufferTarget() });

		const conversion = await Conversion.init({
			input,
			output,
			trim: trimStart > 0 || trimEnd != null ? { start: trimStart, end: trimEnd } : undefined,
			video: {
				width,
				height,
				fit: 'fill',
				codec: toMediabunnyCodec(codec),
				bitrate,
				forceTranscode: true,
				process: createVideoProcess(filters),
			},
			audio: { discard: true },
		});

		conversion.onProgress = onProgress;
		if (!conversion.isValid) {
			throw new Error(
				`Invalid export settings: ${conversion.discardedTracks
					.map((entry) => `${entry.track.type}:${entry.reason}`)
					.join(', ')}`,
			);
		}

		await conversion.execute();
		const buffer = output.target.buffer;
		if (!buffer) throw new Error('No output buffer produced');
		onProgress?.(1);
		return new Blob([buffer], { type: outputFormat.mimeType });
	} finally {
		input.dispose();
	}
}
