import type { FilterParams } from '@/modules/shared-core/types/filters.ts';
import { FilterPipeline } from '@/modules/shared-core/filter-pipeline.ts';
import { WebCodecsVideoDecoder } from '../decode/webcodecs-decoder.ts';
import { Mp4boxDemuxer } from '../demux/mp4box-demuxer.ts';
import { createContainerMuxer, type ContainerFormat, type ContainerMuxer } from '../encode/muxer.ts';
import { WebCodecsVideoEncoder, type VideoCodec } from '../encode/webcodecs-encoder.ts';

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

/**
 * Full WebCodecs export pipeline:
 * File → mp4box.js → VideoDecoder → VideoFrame
 *   → WebGL filter → OffscreenCanvas → VideoFrame
 *   → VideoEncoder → EncodedVideoChunk
 *   → mp4-muxer/webm-muxer → Blob
 */
export async function exportWithWebCodecs(options: WebCodecsExportOptions): Promise<Blob> {
	const { file, filters, codec, container, width, height, bitrate, trimStart = 0, trimEnd, onProgress } = options;

	// Set up pipeline components
	const demuxer = new Mp4boxDemuxer();
	const decoder = new WebCodecsVideoDecoder();
	const encoder = new WebCodecsVideoEncoder();

	// OffscreenCanvas for filter rendering (no DOM needed)
	const offscreen = new OffscreenCanvas(width, height);
	const filterPipeline = new FilterPipeline(offscreen);

	const tracks = await demuxer.open(file);
	const videoTrack = tracks.find((t) => t.type === 'video');
	if (!videoTrack) throw new Error('No video track found');

	const duration = trimEnd ?? videoTrack.duration;
	const trimStartUs = trimStart * 1_000_000;
	const trimEndUs = duration * 1_000_000;

	// Map video codec to muxer codec identifier
	const muxerCodec = codec === 'avc1' ? ('avc' as const) : codec === 'vp09' ? ('vp9' as const) : ('av1' as const);

	const muxer = createContainerMuxer({ container, video: { codec: muxerCodec, width, height } });

	// Configure encoder
	encoder.configure({
		codec,
		width,
		height,
		bitrate,
		framerate: videoTrack.width ? 30 : undefined,
		onChunk: (chunk, metadata) => {
			muxer.addVideoChunk(chunk, metadata);
		},
	});

	let framesProcessed = 0;
	const totalFrames = Math.ceil((duration - trimStart) * 30); // estimate

	// Configure decoder
	decoder.configure({
		track: videoTrack,
		onFrame: (frame) => {
			const ts = frame.timestamp;

			// Skip frames before trim start
			if (ts < trimStartUs) {
				frame.close();
				return;
			}

			// Stop after trim end
			if (ts > trimEndUs) {
				frame.close();
				return;
			}

			// Upload frame to WebGL, apply filters
			filterPipeline.uploadVideoFrame(frame);
			frame.close();
			filterPipeline.render(filters);

			// Read filtered canvas as new VideoFrame for encoder
			const bitmap = (offscreen as OffscreenCanvas).transferToImageBitmap();
			const filteredFrame = new VideoFrame(bitmap, { timestamp: ts - trimStartUs });
			bitmap.close();

			encoder.encode(filteredFrame);
			filteredFrame.close();

			framesProcessed++;
			onProgress?.(Math.min(1, framesProcessed / totalFrames));
		},
		onError: (err) => {
			throw err;
		},
	});

	// Set up extraction and start
	demuxer.setExtractionTrack(videoTrack.id, (sample) => {
		decoder.decode(sample);
	});

	if (trimStart > 0) {
		demuxer.seek(trimStart);
	}
	demuxer.start();

	// Wait for all frames to be processed
	await decoder.flush();
	await encoder.flush();

	// Finalize muxer
	const blob = muxer.finalize();

	// Cleanup
	encoder.destroy();
	decoder.destroy();
	demuxer.destroy();
	filterPipeline.destroy();

	onProgress?.(1);
	return blob;
}
