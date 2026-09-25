/**
 * Converting a video: its pictures encoded again with the editor's cuts, crop, turns and colours,
 * its sound copied or encoded again, through Mediabunny's Conversion. The pictures are drawn by
 * the same WebGL renderer as the preview, so the file looks like what was on screen.
 */
import {
	ALL_FORMATS,
	type AudioCodec,
	BlobSource,
	Conversion,
	type ConversionAudioOptions,
	type ConversionVideoOptions,
	getEncodableVideoCodecs,
	Input,
	type InputAudioTrack,
	type InputVideoTrack,
	MkvOutputFormat,
	MovOutputFormat,
	Mp4OutputFormat,
	Output,
	type OutputFormat,
	Quality,
	type Target,
	type VideoCodec,
	VideoSample,
	WebMOutputFormat,
} from 'mediabunny';
import { isShortened, keptRanges } from '@/document/kept';
import { isKept, toOutput } from '@/document/timemap';
import { ensureEncoder } from '../audio/export';
import { effectiveCrop, type ImageDoc, orientedSize, type Size } from '../image/document';
import { ImageRenderer } from '../image/renderer';
import { gainOf, placeAudio, placeRanges } from './audio-pieces';
import { type BurnJob, type Box, createBurner, type SubtitleBurner } from './burn';
import { isPictureEdited, type VideoDoc } from './document';

export type VideoContainer = 'mp4' | 'mov' | 'mkv' | 'webm';
export type VideoCodecId = 'avc' | 'hevc' | 'vp9' | 'av1';
/** The sound as it is, or encoded again. */
export type AudioChoice = 'copy' | 'aac' | 'opus';

export interface VideoExportSettings {
	/** Copy the tracks as they are, or encode the pictures again. */
	mode: 'copy' | 'encode';
	container: VideoContainer;
	codec: VideoCodecId;
	/** Height of the output; null keeps the crop's. */
	height: number | null;
	/** Pictures per second; null keeps the source's. */
	frameRate: number | null;
	/** Video bitrate, in kb/s. */
	bitrate: number;
	audio: AudioChoice;
	/** Audio bitrate per track, in kb/s, when encoded again. */
	audioBitrate: number;
	/** The subtitle track burned into the pictures, by its key in the track list. */
	burn: string | null;
}

export const CONTAINERS: Record<
	VideoContainer,
	{
		label: string;
		extension: string;
		mime: string;
		codecs: VideoCodecId[];
		audio: AudioCodec[];
		create: () => OutputFormat;
	}
> = {
	mp4: {
		label: 'MP4',
		extension: 'mp4',
		mime: 'video/mp4',
		codecs: ['avc', 'hevc', 'vp9', 'av1'],
		audio: ['aac', 'opus', 'mp3', 'flac', 'ac3', 'eac3'],
		// The index goes at the end: written as the file grows, never held in memory.
		create: () => new Mp4OutputFormat({ fastStart: false }),
	},
	mov: {
		label: 'MOV',
		extension: 'mov',
		mime: 'video/quicktime',
		codecs: ['avc', 'hevc'],
		audio: ['aac', 'mp3', 'ac3', 'eac3'],
		create: () => new MovOutputFormat({ fastStart: false }),
	},
	mkv: {
		label: 'MKV',
		extension: 'mkv',
		mime: 'video/x-matroska',
		codecs: ['avc', 'hevc', 'vp9', 'av1'],
		audio: ['aac', 'opus', 'mp3', 'flac', 'vorbis', 'ac3', 'eac3'],
		create: () => new MkvOutputFormat(),
	},
	webm: {
		label: 'WebM',
		extension: 'webm',
		mime: 'video/webm',
		codecs: ['vp9', 'av1'],
		audio: ['opus', 'vorbis'],
		create: () => new WebMOutputFormat(),
	},
};

export const CODEC_LABELS: Record<VideoCodecId, string> = { avc: 'H.264', hevc: 'HEVC', vp9: 'VP9', av1: 'AV1' };

/** What the source is made of, read once: the export starts from it. */
export interface VideoSource {
	container: VideoContainer;
	codec: VideoCodec | null;
	/** Pictures per second, rounded to three decimals. */
	frameRate: number | null;
	/** Video bitrate in kb/s. */
	bitrate: number | null;
	audioCodec: AudioCodec | null;
	/** Bitrate of the main audio track, in kb/s. */
	audioBitrate: number | null;
}

function containerOf(format: string): VideoContainer {
	if (format === 'mkv' || format === 'webm' || format === 'mov') return format;
	return 'mp4';
}

export async function readVideoSource(file: File, format: string): Promise<VideoSource | null> {
	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
	try {
		const [video, audio] = await Promise.all([input.getPrimaryVideoTrack(), input.getPrimaryAudioTrack()]);
		if (!video) return null;
		// A few hundred packets from the start: enough for a bitrate, quick even on a film.
		const [codec, videoStats, audioCodec, audioStats] = await Promise.all([
			video.getCodec(),
			video.computePacketStats(300).catch(() => null),
			audio ? audio.getCodec() : Promise.resolve(null),
			audio ? audio.computePacketStats(300).catch(() => null) : Promise.resolve(null),
		]);
		const kbps = (bits: number | undefined) => (bits && bits > 0 ? Math.round(bits / 1000) : null);
		return {
			container: containerOf(format),
			codec,
			frameRate: videoStats?.averagePacketRate ? Math.round(videoStats.averagePacketRate * 1000) / 1000 : null,
			bitrate: kbps(videoStats?.averageBitrate),
			audioCodec,
			audioBitrate: kbps(audioStats?.averageBitrate),
		};
	} catch {
		return null;
	} finally {
		input.dispose();
	}
}

function isCodecId(codec: VideoCodec | null): codec is VideoCodecId {
	return codec === 'avc' || codec === 'hevc' || codec === 'vp9' || codec === 'av1';
}

/** Codecs this browser encodes, for pictures of this size. */
export async function encodableCodecs(size: Size): Promise<VideoCodecId[]> {
	const found: VideoCodec[] = await getEncodableVideoCodecs(['avc', 'hevc', 'vp9', 'av1'], size).catch(() => []);
	return found.filter((codec) => isCodecId(codec));
}

/** Whether the sound can be copied into the container: its codec must fit. */
export function audioFits(source: VideoSource, container: VideoContainer): boolean {
	return source.audioCodec === null || CONTAINERS[container].audio.includes(source.audioCodec);
}

/**
 * The sound as it will be written: copied when asked and possible, else encoded in the codec the
 * container takes. Removed passages always need it encoded again.
 */
export function resolveAudio(settings: VideoExportSettings, source: VideoSource, cuts: boolean): AudioChoice {
	if (settings.audio !== 'copy') return settings.container === 'webm' ? 'opus' : settings.audio;
	if (!cuts && audioFits(source, settings.container)) return 'copy';
	return settings.container === 'webm' ? 'opus' : 'aac';
}

/**
 * Settings that reproduce the source: same container, codec, frame rate and bitrate, the sound
 * copied. A codec this browser can't encode falls back to one it can.
 */
export function settingsFromSource(source: VideoSource, encodable: VideoCodecId[]): VideoExportSettings {
	const container = source.container;
	const fits = CONTAINERS[container].codecs.filter((codec) => encodable.includes(codec));
	const codec = isCodecId(source.codec) && fits.includes(source.codec) ? source.codec : (fits[0] ?? 'avc');
	return {
		mode: 'copy',
		container,
		codec,
		height: null,
		frameRate: null,
		bitrate: source.bitrate ?? 5000,
		audio: audioFits(source, container) ? 'copy' : container === 'webm' ? 'opus' : 'aac',
		audioBitrate: Math.min(320, Math.max(64, source.audioBitrate ?? 160)),
		burn: null,
	};
}

/** Encoders want even sizes. */
function even(value: number): number {
	return Math.max(2, Math.round(value / 2) * 2);
}

/** Size of the exported pictures: the crop, brought down to the chosen height. */
export function outputSize(picture: ImageDoc, upright: Size, height: number | null): Size {
	const crop = effectiveCrop(picture, upright);
	const scale = height === null ? 1 : Math.min(1, height / crop.height);
	return { width: even(crop.width * scale), height: even(crop.height * scale) };
}

/** Heights offered, below the crop's own. */
export const HEIGHTS = [2160, 1440, 1080, 720, 540, 480, 360];

/** Frame rates offered, besides the source's. */
export const FRAME_RATES = [60, 50, 30, 25, 24];

/**
 * Where the whole picture lies on the exported one, for burned subtitles: offset and scaled by
 * the crop, as the preview lays them. Once turned or mirrored, they simply cover the picture.
 */
export function burnBox(picture: ImageDoc, upright: Size, size: Size): Box {
	if (picture.rotation !== 0 || picture.flipX || picture.flipY) return { x: 0, y: 0, ...size };
	const crop = effectiveCrop(picture, upright);
	const scale = size.width / crop.width;
	return { x: -crop.x * scale, y: -crop.y * scale, width: upright.width * scale, height: upright.height * scale };
}

/** Draws each picture with the edits, at the output size, as the preview does, subtitles on top. */
class PictureProcessor {
	private readonly canvas: OffscreenCanvas;
	private readonly renderer: ImageRenderer;
	/** Where the subtitles are drawn over the picture, when some are burned in. */
	private readonly composite: { canvas: OffscreenCanvas; context: OffscreenCanvasRenderingContext2D } | null;

	constructor(
		private readonly picture: ImageDoc,
		private readonly upright: Size,
		size: Size,
		private readonly burner: SubtitleBurner | null,
	) {
		this.canvas = new OffscreenCanvas(size.width, size.height);
		this.renderer = new ImageRenderer(this.canvas);
		const canvas = burner ? new OffscreenCanvas(size.width, size.height) : null;
		const context = canvas?.getContext('2d');
		this.composite = canvas && context ? { canvas, context } : null;
	}

	/** The picture at `timestamp` in the output, `time` in the source. */
	async draw(sample: VideoSample, timestamp: number, time: number): Promise<VideoSample> {
		this.renderer.setFrame(
			sample.toCanvasImageSource(),
			{ width: sample.squarePixelWidth, height: sample.squarePixelHeight },
			sample.rotation,
		);
		this.renderer.render(this.picture, { region: effectiveCrop(this.picture, this.upright) });
		if (!this.composite || !this.burner)
			return new VideoSample(this.canvas, { timestamp, duration: sample.duration });
		const { canvas, context } = this.composite;
		context.clearRect(0, 0, canvas.width, canvas.height);
		context.drawImage(this.canvas, 0, 0);
		await this.burner.draw(context, time);
		return new VideoSample(canvas, { timestamp, duration: sample.duration });
	}

	dispose() {
		this.renderer.dispose();
	}
}

/** Runs a conversion to its end; stopping throws an AbortError. */
async function run(conversion: Conversion, onProgress: (share: number) => void, signal: AbortSignal) {
	conversion.onProgress = onProgress;
	const stop = () => {
		void conversion.cancel();
	};
	signal.addEventListener('abort', stop);
	try {
		await conversion.execute();
	} finally {
		signal.removeEventListener('abort', stop);
	}
	if (signal.aborted) throw new DOMException('Stopped', 'AbortError');
}

/** Whether some sound will be encoded in AAC: asked for, or chosen for the container. */
function encodesAac(settings: VideoExportSettings, reencoded: boolean): boolean {
	if (settings.audio === 'aac') return true;
	return settings.audio === 'copy' && reencoded && settings.container !== 'webm';
}

/** This browser can't encode a track with the chosen settings. */
export class EncoderMissing extends Error {
	constructor(readonly kind: 'video' | 'audio') {
		super(`No ${kind} encoder for these settings`);
		this.name = 'EncoderMissing';
	}
}

export interface ConvertJob {
	file: File;
	doc: VideoDoc;
	settings: VideoExportSettings;
	/** Size of the source's pictures, upright. */
	upright: Size;
	/** Audio tracks kept, by the IDs the file gives them, with the change of their level in dB. */
	audioTracks: ReadonlyMap<number, number>;
	/** Subtitles burned into the pictures. */
	burn?: BurnJob | null;
}

/**
 * Converts the video into `target`. Resolves once the output is finalized; stopping throws an
 * AbortError.
 */
export async function convertVideo(
	job: ConvertJob,
	target: Target,
	onProgress: (share: number) => void,
	signal: AbortSignal,
): Promise<void> {
	const { doc, settings } = job;
	const input = new Input({ source: new BlobSource(job.file), formats: ALL_FORMATS });
	const output = new Output({ format: CONTAINERS[settings.container].create(), target });
	const ranges = keptRanges(doc);
	const cuts = doc.cuts.length > 0;
	// Burned subtitles are drawn over the pictures, which then go through the renderer too.
	const burner =
		job.burn && settings.mode === 'encode'
			? await createBurner(
					job.burn,
					job.upright,
					burnBox(doc.picture, job.upright, outputSize(doc.picture, job.upright, settings.height)),
				)
			: null;
	const drawn = isPictureEdited(doc.picture) || burner !== null;
	const size = outputSize(doc.picture, job.upright, settings.height);
	// Conversion times start at the trim; the edit's ranges are in source time.
	const offset = isShortened(doc) ? doc.trim.start : 0;
	let processor: PictureProcessor | null = null;

	const video = (track: InputVideoTrack): ConversionVideoOptions => {
		if (track.number > 1) return { discard: true };
		const options: ConversionVideoOptions = {
			codec: settings.codec,
			quality: new Quality({ bitrate: settings.bitrate * 1000 }),
			frameRate: settings.frameRate ?? undefined,
			forceTranscode: true,
		};
		if (!drawn && !cuts) return { ...options, width: size.width, height: size.height, fit: 'fill' };
		if (drawn) {
			processor = new PictureProcessor(doc.picture, job.upright, size, burner);
			options.processedWidth = size.width;
			options.processedHeight = size.height;
			// The renderer turns the pictures itself; the file carries no rotation.
			options.allowTransformationMetadata = false;
		} else {
			options.width = size.width;
			options.height = size.height;
			options.fit = 'fill';
		}
		options.process = async (sample) => {
			const time = sample.timestamp + offset;
			if (cuts && !isKept(ranges, time)) return null;
			const timestamp = cuts ? toOutput(ranges, time) : sample.timestamp;
			if (processor) return processor.draw(sample, timestamp, time);
			const moved = sample.clone();
			moved.setTimestamp(timestamp);
			return moved;
		};
		return options;
	};

	const placed = placeRanges(ranges);
	const audio = (track: InputAudioTrack): ConversionAudioOptions => {
		const decibels = job.audioTracks.get(track.id);
		if (decibels === undefined) return { discard: true };
		// Removed passages and level changes are made on decoded sound: it is then encoded again.
		const copy = settings.audio === 'copy' && !cuts && decibels === 0;
		const options: ConversionAudioOptions = copy
			? {}
			: {
					codec:
						settings.audio === 'copy' ? (settings.container === 'webm' ? 'opus' : 'aac') : settings.audio,
					quality: new Quality({ bitrate: settings.audioBitrate * 1000 }),
				};
		const gain = gainOf(decibels);
		if (cuts || gain !== 1) options.process = (sample) => placeAudio(sample, placed, offset, gain);
		return options;
	};

	if (settings.mode === 'copy') {
		// Packets copied as they are: only the trim applies. MP4 starts exactly at it, an edit list
		// hiding the pictures before.
		const copy = (track: InputVideoTrack | InputAudioTrack) =>
			(track.isVideoTrack() && track.number > 1) || (track.isAudioTrack() && !job.audioTracks.has(track.id))
				? { discard: true }
				: {};
		try {
			const conversion = await Conversion.init({
				input,
				output,
				trim: isShortened(doc) ? { start: doc.trim.start, end: doc.trim.end } : undefined,
				video: copy,
				audio: copy,
				copy: { mode: 'forced', shiftTolerance: Number.POSITIVE_INFINITY },
			});
			await run(conversion, onProgress, signal);
		} finally {
			input.dispose();
		}
		return;
	}

	try {
		// Browsers without their own AAC encoder (Chromium) get the WebAssembly one.
		if (encodesAac(settings, cuts || [...job.audioTracks.values()].some((decibels) => decibels !== 0))) {
			await ensureEncoder('aac', { numberOfChannels: 2, sampleRate: 48_000 });
		}
		const conversion = await Conversion.init({
			input,
			output,
			trim: isShortened(doc) ? { start: doc.trim.start, end: doc.trim.end } : undefined,
			video,
			audio,
		});
		// A track left out by the browser rather than by the user would go missing silently: a
		// file without its pictures, or without a sound track that was kept.
		const lost = conversion.discardedTracks.filter((discarded) => discarded.reason !== 'discarded_by_user');
		if (!conversion.isValid || lost.length > 0) {
			throw new EncoderMissing(lost.some((discarded) => discarded.track.type === 'video') ? 'video' : 'audio');
		}
		await run(conversion, onProgress, signal);
	} finally {
		(processor as PictureProcessor | null)?.dispose();
		burner?.dispose();
		input.dispose();
	}
}

/** The upright size of the output's pictures once turned, for labels. */
export function turnedSize(picture: ImageDoc, upright: Size): Size {
	return orientedSize(upright, picture.rotation);
}
