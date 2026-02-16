import type { FilterParams } from '@/modules/shared-core/types/filters.ts';
import { DEFAULT_FILTER_PARAMS } from '@/modules/shared-core/types/filters.ts';
import type { DemuxedTrack } from './demux/demuxer.ts';
import { WebCodecsVideoDecoder, WebCodecsAudioDecoder } from './decode/webcodecs-decoder.ts';
import { Mp4boxDemuxer } from './demux/mp4box-demuxer.ts';
import { PlaybackRenderer } from './render/playback-renderer.ts';

export type PipelineState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'seeking' | 'error';

export interface PipelineEvents {
	onStateChange?: (state: PipelineState) => void;
	onTimeUpdate?: (currentTime: number) => void;
	onDurationChange?: (duration: number) => void;
	onTracksReady?: (tracks: DemuxedTrack[]) => void;
	onError?: (error: Error) => void;
}

/**
 * Orchestrates the WebCodecs video playback pipeline:
 * File → Mediabunny packet sink → VideoDecoder → VideoFrame
 *   → WebGL filter → canvas → frame.close()
 */
export class VideoPipeline {
	private demuxer: Mp4boxDemuxer;
	private videoDecoder: WebCodecsVideoDecoder;
	private audioDecoder: WebCodecsAudioDecoder;
	private renderer: PlaybackRenderer;
	private events: PipelineEvents;

	private state: PipelineState = 'idle';
	private tracks: DemuxedTrack[] = [];
	private videoTrack: DemuxedTrack | null = null;
	private audioTrack: DemuxedTrack | null = null;

	private filters: FilterParams = { ...DEFAULT_FILTER_PARAMS };
	private currentTime = 0;
	private duration = 0;
	private playing = false;
	private animationFrameId = 0;

	// Frame queue for smooth playback (limit to ~3 frames ahead)
	private frameQueue: VideoFrame[] = [];
	private readonly MAX_FRAME_QUEUE = 3;

	constructor(canvas: HTMLCanvasElement, events: PipelineEvents = {}) {
		this.demuxer = new Mp4boxDemuxer();
		this.videoDecoder = new WebCodecsVideoDecoder();
		this.audioDecoder = new WebCodecsAudioDecoder();
		this.renderer = new PlaybackRenderer(canvas);
		this.events = events;
	}

	get currentState(): PipelineState {
		return this.state;
	}

	get currentFilters(): FilterParams {
		return this.filters;
	}

	get videoDuration(): number {
		return this.duration;
	}

	get time(): number {
		return this.currentTime;
	}

	async loadFile(file: File): Promise<DemuxedTrack[]> {
		this.setState('loading');

		try {
			this.tracks = await this.demuxer.open(file);
			this.videoTrack = this.tracks.find((t) => t.type === 'video') ?? null;
			this.audioTrack = this.tracks.find((t) => t.type === 'audio') ?? null;

			if (!this.videoTrack) {
				throw new Error('No video track found');
			}

			this.duration = this.videoTrack.duration;
			this.events.onDurationChange?.(this.duration);
			this.events.onTracksReady?.(this.tracks);

			// Configure video decoder
			this.videoDecoder.configure({
				track: this.videoTrack,
				onFrame: (frame) => {
					this.handleVideoFrame(frame);
				},
				onError: (err) => {
					this.handleError(err);
				},
			});

			// Set up demuxer extraction
			this.demuxer.setExtractionTrack(this.videoTrack.id, (sample) => {
				this.videoDecoder.decode(sample);
			});

			// Configure audio decoder if available
			if (this.audioTrack) {
				this.audioDecoder.configure(this.audioTrack, (data) => {
					// TODO: Route to Web Audio API for playback
					data.close();
				});

				this.demuxer.setExtractionTrack(this.audioTrack.id, (sample) => {
					this.audioDecoder.decode(sample);
				});
			}

			this.setState('ready');
			return this.tracks;
		} catch (err) {
			this.handleError(err instanceof Error ? err : new Error(String(err)));
			return [];
		}
	}

	play(): void {
		if (this.state !== 'ready' && this.state !== 'paused') return;
		this.playing = true;
		this.setState('playing');
		this.demuxer.start();
		this.scheduleRender();
	}

	pause(): void {
		this.playing = false;
		this.setState('paused');
		cancelAnimationFrame(this.animationFrameId);
	}

	async seek(timeS: number): Promise<void> {
		const wasPlaying = this.playing;
		this.pause();
		this.setState('seeking');

		// Drain frame queue
		for (const f of this.frameQueue) f.close();
		this.frameQueue = [];

		// Reset decoder and seek demuxer
		await this.videoDecoder.flush();
		this.demuxer.seek(timeS);
		this.currentTime = timeS;
		this.events.onTimeUpdate?.(timeS);

		// Start extraction to get the frame at seek position
		this.demuxer.start();

		this.setState(wasPlaying ? 'playing' : 'paused');
		if (wasPlaying) this.play();
	}

	setFilters(filters: FilterParams): void {
		this.filters = filters;
		// If paused with a frame available, re-render with new filters
		if (!this.playing && this.frameQueue.length > 0) {
			const frame = this.frameQueue[0]!;
			this.renderer.renderFrame(frame, this.filters);
		}
	}

	destroy(): void {
		this.pause();
		for (const f of this.frameQueue) f.close();
		this.frameQueue = [];
		this.videoDecoder.destroy();
		this.audioDecoder.destroy();
		this.demuxer.destroy();
		this.renderer.destroy();
		this.setState('idle');
	}

	private handleVideoFrame(frame: VideoFrame): void {
		if (this.frameQueue.length >= this.MAX_FRAME_QUEUE) {
			// Drop oldest frame to prevent memory pressure
			this.frameQueue.shift()?.close();
		}
		this.frameQueue.push(frame);
	}

	private scheduleRender(): void {
		if (!this.playing) return;

		this.animationFrameId = requestAnimationFrame(() => {
			this.renderNextFrame();
			this.scheduleRender();
		});
	}

	private renderNextFrame(): void {
		if (this.frameQueue.length === 0) return;

		const frame = this.frameQueue.shift()!;
		this.currentTime = frame.timestamp / 1_000_000; // microseconds to seconds
		this.events.onTimeUpdate?.(this.currentTime);

		this.renderer.renderFrame(frame, this.filters);
		frame.close(); // CRITICAL: release VideoFrame memory immediately

		// Check if we've reached the end
		if (this.currentTime >= this.duration) {
			this.pause();
		}
	}

	private setState(state: PipelineState): void {
		this.state = state;
		this.events.onStateChange?.(state);
	}

	private handleError(error: Error): void {
		console.error('VideoPipeline error:', error);
		this.setState('error');
		this.events.onError?.(error);
	}
}
