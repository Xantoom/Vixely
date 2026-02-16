import type { FilterParams } from '@/modules/shared-core/types/filters.ts';
import type { DemuxedSample, Demuxer } from '../demux/demuxer.ts';
import type { PlaybackRenderer } from './playback-renderer.ts';
import { WebCodecsVideoDecoder } from '../decode/webcodecs-decoder.ts';

/**
 * Seek renderer: flush decoder, seek to nearest keyframe,
 * decode forward to target PTS, render single frame.
 */
export class SeekRenderer {
	private decoder: WebCodecsVideoDecoder;
	private demuxer: Demuxer;
	private renderer: PlaybackRenderer;
	private pendingFrame: VideoFrame | null = null;

	constructor(decoder: WebCodecsVideoDecoder, demuxer: Demuxer, renderer: PlaybackRenderer) {
		this.decoder = decoder;
		this.demuxer = demuxer;
		this.renderer = renderer;
	}

	/**
	 * Seek to a specific time and render the frame at that position.
	 * Returns when the target frame has been rendered.
	 */
	async seekAndRender(timeS: number, filters: FilterParams): Promise<void> {
		// Close any pending frame from previous seek
		this.pendingFrame?.close();
		this.pendingFrame = null;

		// Reset decoder state
		await this.decoder.reset();

		// Seek demuxer to nearest keyframe
		const { keyframeTimestamp } = this.demuxer.seek(timeS);

		const targetTimestamp = timeS * 1_000_000; // to microseconds

		// Set up frame capture - we want the frame closest to target time
		return new Promise<void>((resolve) => {
			let bestFrame: VideoFrame | null = null;

			const originalCallback = (frame: VideoFrame) => {
				if (frame.timestamp <= targetTimestamp) {
					bestFrame?.close();
					bestFrame = frame;
				} else {
					// Past target - use best frame we have
					frame.close();
					if (bestFrame) {
						this.renderer.renderFrame(bestFrame, filters);
						bestFrame.close();
						bestFrame = null;
					}
					resolve();
				}
			};

			// Temporarily redirect frame output
			this.decoder.configure({
				track: this.demuxer as never, // will be reconfigured by pipeline
				onFrame: originalCallback,
			});

			// Start extraction from keyframe position
			this.demuxer.start();
		});
	}

	destroy(): void {
		this.pendingFrame?.close();
		this.pendingFrame = null;
	}
}
