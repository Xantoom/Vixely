import { WebCodecsVideoDecoder } from '@/modules/video-editor/decode/webcodecs-decoder.ts';
import { Mp4boxDemuxer } from '@/modules/video-editor/demux/mp4box-demuxer.ts';

export interface FrameExtractionOptions {
	file: File;
	targetFps: number;
	maxFrames?: number;
	trimStart?: number;
	trimEnd?: number;
	onProgress?: (extracted: number, total: number) => void;
}

/**
 * Extract VideoFrames from a video file at the target FPS using WebCodecs.
 * Returns an array of VideoFrames that the caller must close() when done.
 */
export async function extractFrames(options: FrameExtractionOptions): Promise<VideoFrame[]> {
	const { file, targetFps, maxFrames = 300, trimStart = 0, trimEnd, onProgress } = options;

	const demuxer = new Mp4boxDemuxer();
	const decoder = new WebCodecsVideoDecoder();

	const tracks = await demuxer.open(file);
	const videoTrack = tracks.find((t) => t.type === 'video');
	if (!videoTrack) throw new Error('No video track found');

	const duration = trimEnd ?? videoTrack.duration;
	const frameInterval = 1_000_000 / targetFps; // microseconds
	const trimStartUs = trimStart * 1_000_000;
	const trimEndUs = duration * 1_000_000;
	const totalFrames = Math.min(maxFrames, Math.ceil((duration - trimStart) * targetFps));

	const frames: VideoFrame[] = [];
	let lastCapturedTimestamp = -Infinity;

	return new Promise((resolve, reject) => {
		decoder.configure({
			track: videoTrack,
			onFrame: (frame) => {
				const ts = frame.timestamp;

				// Skip before trim start
				if (ts < trimStartUs) {
					frame.close();
					return;
				}

				// Stop after trim end or max frames
				if (ts > trimEndUs || frames.length >= maxFrames) {
					frame.close();
					return;
				}

				// Sample at target FPS rate
				if (ts - lastCapturedTimestamp >= frameInterval) {
					frames.push(frame);
					lastCapturedTimestamp = ts;
					onProgress?.(frames.length, totalFrames);
				} else {
					frame.close();
				}
			},
			onError: reject,
		});

		demuxer.setExtractionTrack(videoTrack.id, (sample) => {
			decoder.decode(sample);
		});

		if (trimStart > 0) {
			demuxer.seek(trimStart);
		}
		demuxer.start();

		// Flush and resolve
		decoder
			.flush()
			.then(() => {
				decoder.destroy();
				demuxer.destroy();
				resolve(frames);
			})
			.catch(reject);
	});
}
