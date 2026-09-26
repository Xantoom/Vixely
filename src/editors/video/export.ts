/**
 * Converting a video: its pictures encoded again with the editor's cuts, crop, turns and colours,
 * its sound copied or encoded again, through Mediabunny's Conversion. The pictures are drawn by
 * the same WebGL renderer as the preview, so the file looks like what was on screen.
 */
import {
	ALL_FORMATS,
	AttachedFile,
	type AudioCodec,
	BlobSource,
	Conversion,
	type ConversionAudioOptions,
	type ConversionVideoOptions,
	getEncodableVideoCodecs,
	Input,
	type InputAudioTrack,
	type InputVideoTrack,
	type MetadataTags,
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
import { drawOverlays, loadOverlayAssets } from '@/editor/overlays/draw';
import { ensureEncoder } from '../audio/export';
import { effectiveCrop, type ImageDoc, orientedSize, type Size } from '../image/document';
import { ImageRenderer } from '../image/renderer';
import { gainOf, placeAudio, placeRanges } from './audio-pieces';
import { type BurnJob, type Box, createBurner, type SubtitleBurner } from './burn';
import { editTurn, pictureChange, type Turn, type VideoDoc, type VideoMeta } from './document';

export type VideoContainer = 'mp4' | 'mov' | 'mkv' | 'webm';
export type VideoCodecId = 'avc' | 'hevc' | 'vp9' | 'av1';
/** The sound as it is, or encoded again. */
export type AudioChoice = 'copy' | 'aac' | 'opus';

export interface VideoExportSettings {
	/** Copy the tracks as they are, or encode the pictures again. */
	mode: 'copy' | 'encode';
	container: VideoContainer;
	codec: VideoCodecId;
	/** Shorter side of the output, as in "720p"; null keeps the crop's. */
	height: number | null;
	/** Pictures per second; null keeps the source's. */
	frameRate: number | null;
	/** Kept to a bitrate, or to a quality whatever the bitrate it takes (as FFmpeg's CRF). */
	rateControl: 'bitrate' | 'quality';
	/** Video bitrate, in kb/s. */
	bitrate: number;
	/** Quality level from 0 (worst) to 1 (best), when kept to a quality. */
	quality: number;
	audio: AudioChoice;
	/** Audio bitrate per track, in kb/s, when encoded again. */
	audioBitrate: number;
	/** The subtitle track burned into the pictures, by its key in the track list. */
	burn: string | null;
	/** Largest file wanted, in MB: the video bitrate then follows from the length. */
	sizeLimit: number | null;
	/** The platform the settings were chosen for, until one of them changes. */
	preset: PresetId | null;
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
	/** How the file says to show the pictures. */
	turn: Turn;
	/** Title, artist, date and cover as the file has them. */
	meta: VideoMeta;
}

function containerOf(format: string): VideoContainer {
	if (format === 'mkv' || format === 'webm' || format === 'mov') return format;
	return 'mp4';
}

export async function readVideoSource(file: File, format: string): Promise<VideoSource | null> {
	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
	try {
		const [video, audio, tags] = await Promise.all([
			input.getPrimaryVideoTrack(),
			input.getPrimaryAudioTrack(),
			input.getMetadataTags().catch((): MetadataTags => ({})),
		]);
		if (!video) return null;
		// A few hundred packets from the start: enough for a bitrate, quick even on a film.
		const [codec, videoStats, rate, audioCodec, audioStats, rotation, flip] = await Promise.all([
			video.getCodec(),
			video.computePacketStats(300).catch(() => null),
			video.computeFrameRateMetrics({ targetPacketCount: 300 }).catch(() => null),
			audio ? audio.getCodec() : Promise.resolve(null),
			audio ? audio.computePacketStats(300).catch(() => null) : Promise.resolve(null),
			video.getRotation(),
			video.getFlip(),
		]);
		const kbps = (bits: number | undefined) => (bits && bits > 0 ? Math.round(bits / 1000) : null);
		return {
			container: containerOf(format),
			codec,
			frameRate: rate?.bestGuessFrameRate ? Math.round(rate.bestGuessFrameRate * 1000) / 1000 : null,
			bitrate: kbps(videoStats?.averageBitrate),
			audioCodec,
			audioBitrate: kbps(audioStats?.averageBitrate),
			turn: { rotation, flip },
			meta: readMeta(tags),
		};
	} catch {
		return null;
	} finally {
		input.dispose();
	}
}

/** The cover of a file: its front cover, else its first picture. */
function coverOf(tags: MetadataTags) {
	const images = tags.images ?? [];
	const image = images.find((candidate) => candidate.kind === 'coverFront') ?? images[0];
	return image ? { data: image.data, mimeType: image.mimeType } : null;
}

/** What the file says about itself, as the metadata fields show it. */
export function readMeta(tags: MetadataTags): VideoMeta {
	const date = tags.date && !Number.isNaN(tags.date.getTime()) ? tags.date.toISOString().slice(0, 10) : '';
	return {
		title: tags.title?.trim() ?? '',
		artist: (tags.artist ?? tags.albumArtist)?.trim() ?? '',
		comment: (tags.comment ?? tags.description)?.trim() ?? '',
		date,
		cover: coverOf(tags),
	};
}

/**
 * The file's tags with the edited ones in place of its own. The format's raw tags go, as they
 * would say the old title; attached files other than pictures stay (subtitle fonts).
 */
export function writeMeta(tags: MetadataTags, meta: VideoMeta | null): MetadataTags {
	if (!meta) return tags;
	const raw = Object.fromEntries(
		Object.entries(tags.raw ?? {}).filter(
			([, value]) => value instanceof AttachedFile && !value.mimeType?.startsWith('image/'),
		),
	);
	const cover = meta.cover
		? [
				{
					...meta.cover,
					kind: 'coverFront' as const,
					name: meta.cover.mimeType === 'image/png' ? 'cover.png' : 'cover.jpg',
				},
			]
		: [];
	const date = meta.date ? new Date(`${meta.date}T00:00:00Z`) : undefined;
	return {
		album: tags.album,
		genre: tags.genre,
		title: meta.title || undefined,
		artist: meta.artist || undefined,
		comment: meta.comment || undefined,
		date: date && !Number.isNaN(date.getTime()) ? date : undefined,
		images: cover,
		raw,
	};
}

/** The quality levels offered, as Mediabunny names them. */
export const QUALITY_LEVELS = [1, 0.75, 0.5, 0.25, 0] as const;

/** The video's rate control for Mediabunny: a size limit always keeps to its bitrate. */
function videoQuality(settings: VideoExportSettings): Quality {
	if (settings.rateControl === 'quality' && settings.sizeLimit === null)
		return new Quality({ quality: settings.quality });
	return new Quality({
		bitrate: settings.bitrate * 1000,
		bitrateMode: settings.sizeLimit === null ? 'variable' : 'constant',
	});
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
		rateControl: 'bitrate',
		bitrate: source.bitrate ?? 5000,
		quality: 0.75,
		audio: audioFits(source, container) ? 'copy' : container === 'webm' ? 'opus' : 'aac',
		audioBitrate: Math.min(320, Math.max(64, source.audioBitrate ?? 160)),
		burn: null,
		sizeLimit: null,
		preset: null,
	};
}

/** Size limits offered, in MB: those of the places videos are sent to, and round figures. */
export const SIZE_LIMITS = [8, 10, 16, 25, 50, 100, 250, 500, 1000];

/** Share of a size limit given to the pictures and sound, the rest left to the container and to encoders overshooting. */
const SIZE_MARGIN = 0.94;

/** Lowest video bitrate a size limit leads to, in kb/s. */
export const MIN_BITRATE = 50;

/**
 * The video bitrate (kb/s) that keeps a file of `seconds` under `megabytes`, the sound taking
 * `audio` kb/s. MB are counted in millions of bytes, below what services mean by it either way.
 */
export function bitrateForSize(megabytes: number, seconds: number, audio: number): number {
	if (seconds <= 0) return MIN_BITRATE;
	const kilobits = (megabytes * 1_000_000 * 8 * SIZE_MARGIN) / 1000;
	return Math.max(MIN_BITRATE, Math.floor(kilobits / seconds - audio));
}

export type PresetId =
	| 'discord'
	| 'whatsapp'
	| 'email'
	| 'x'
	| 'instagram'
	| 'youtube'
	| 'web'
	| 'tiktok'
	| 'reels'
	| 'shorts'
	| 'instagram-feed';

interface Preset {
	label: string;
	/** The frame the pictures are cropped to, from the middle; absent keeps theirs. */
	aspect?: `${number}:${number}`;
	container: VideoContainer;
	codec: VideoCodecId;
	/** Highest picture height; smaller pictures keep theirs. */
	maxHeight: number;
	/** Highest frame rate; slower videos keep theirs. */
	maxFrameRate: number;
	/** Video bitrate in kb/s, when no size limit applies. */
	bitrate: number;
	sizeLimit: number | null;
	audio: 'aac' | 'opus';
	audioBitrate: number;
}

/**
 * Settings for the places videos go, from their published limits: Discord and WhatsApp cap files
 * at 10 and 16 MB, mail at 25 MB; X, Instagram and YouTube take H.264 in MP4 and re-encode it.
 */
export const PRESETS: Record<PresetId, Preset> = {
	discord: {
		label: 'Discord',
		container: 'mp4',
		codec: 'avc',
		maxHeight: 720,
		maxFrameRate: 30,
		bitrate: 2500,
		sizeLimit: 10,
		audio: 'aac',
		audioBitrate: 96,
	},
	whatsapp: {
		label: 'WhatsApp',
		container: 'mp4',
		codec: 'avc',
		maxHeight: 720,
		maxFrameRate: 30,
		bitrate: 2500,
		sizeLimit: 16,
		audio: 'aac',
		audioBitrate: 96,
	},
	email: {
		label: 'E-mail',
		container: 'mp4',
		codec: 'avc',
		maxHeight: 720,
		maxFrameRate: 30,
		bitrate: 2500,
		sizeLimit: 25,
		audio: 'aac',
		audioBitrate: 96,
	},
	x: {
		label: 'X',
		container: 'mp4',
		codec: 'avc',
		maxHeight: 1080,
		maxFrameRate: 60,
		bitrate: 8000,
		sizeLimit: null,
		audio: 'aac',
		audioBitrate: 128,
	},
	instagram: {
		label: 'Instagram',
		container: 'mp4',
		codec: 'avc',
		maxHeight: 1080,
		maxFrameRate: 30,
		bitrate: 5000,
		sizeLimit: null,
		audio: 'aac',
		audioBitrate: 128,
	},
	youtube: {
		label: 'YouTube',
		container: 'mp4',
		codec: 'avc',
		maxHeight: 2160,
		maxFrameRate: 60,
		bitrate: 12000,
		sizeLimit: null,
		audio: 'aac',
		audioBitrate: 192,
	},
	tiktok: {
		label: 'TikTok',
		aspect: '9:16',
		container: 'mp4',
		codec: 'avc',
		maxHeight: 1080,
		maxFrameRate: 60,
		bitrate: 8000,
		sizeLimit: null,
		audio: 'aac',
		audioBitrate: 128,
	},
	reels: {
		label: 'Instagram Reels',
		aspect: '9:16',
		container: 'mp4',
		codec: 'avc',
		maxHeight: 1080,
		maxFrameRate: 30,
		bitrate: 5000,
		sizeLimit: null,
		audio: 'aac',
		audioBitrate: 128,
	},
	shorts: {
		label: 'YouTube Shorts',
		aspect: '9:16',
		container: 'mp4',
		codec: 'avc',
		maxHeight: 1080,
		maxFrameRate: 60,
		bitrate: 8000,
		sizeLimit: null,
		audio: 'aac',
		audioBitrate: 192,
	},
	'instagram-feed': {
		label: 'Instagram 4:5',
		aspect: '4:5',
		container: 'mp4',
		codec: 'avc',
		maxHeight: 1080,
		maxFrameRate: 30,
		bitrate: 5000,
		sizeLimit: null,
		audio: 'aac',
		audioBitrate: 128,
	},
	web: {
		label: 'Web',
		container: 'webm',
		codec: 'vp9',
		maxHeight: 1080,
		maxFrameRate: 60,
		bitrate: 2500,
		sizeLimit: null,
		audio: 'opus',
		audioBitrate: 128,
	},
};

export const PRESET_ORDER: PresetId[] = [
	'discord',
	'whatsapp',
	'email',
	'tiktok',
	'reels',
	'shorts',
	'instagram-feed',
	'instagram',
	'x',
	'youtube',
	'web',
];

/** YouTube's recommended bitrates for H.264 uploads, by height (at 30 fps; half again above). */
function uploadBitrate(height: number, frameRate: number): number {
	const base = height >= 2160 ? 40000 : height >= 1440 ? 16000 : height >= 1080 ? 8000 : height >= 720 ? 5000 : 2500;
	return frameRate > 30 ? Math.round(base * 1.5) : base;
}

/**
 * The settings a preset gives a video whose pictures are `height` high: never enlarged, never
 * faster than the source. A codec this browser can't encode falls back to one it can.
 */
export function presetSettings(
	id: PresetId,
	source: VideoSource,
	encodable: readonly VideoCodecId[],
	height: number,
): Partial<VideoExportSettings> {
	const preset = PRESETS[id];
	const codecs = CONTAINERS[preset.container].codecs.filter((codec) => encodable.includes(codec));
	const outHeight = Math.min(height, preset.maxHeight);
	const rate = source.frameRate ?? 30;
	return {
		mode: 'encode',
		container: preset.container,
		codec: codecs.includes(preset.codec) ? preset.codec : (codecs[0] ?? preset.codec),
		height: height > preset.maxHeight ? (HEIGHTS.find((candidate) => candidate <= preset.maxHeight) ?? null) : null,
		frameRate: rate > preset.maxFrameRate + 0.5 ? preset.maxFrameRate : null,
		rateControl: 'bitrate',
		bitrate: id === 'youtube' ? uploadBitrate(outHeight, Math.min(rate, preset.maxFrameRate)) : preset.bitrate,
		sizeLimit: preset.sizeLimit,
		audio: preset.audio,
		audioBitrate: preset.audioBitrate,
		preset: id,
	};
}

/** Average bitrates of sound tracks, in kb/s, by track ID, read from their first packets. */
export async function audioBitrates(file: File, ids: readonly number[]): Promise<Map<number, number>> {
	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
	try {
		const tracks = (await input.getAudioTracks()).filter((track) => ids.includes(track.id));
		const stats = await Promise.all(
			tracks.map(async (track) => [track.id, await track.computePacketStats(300).catch(() => null)] as const),
		);
		return new Map(stats.map(([id, found]) => [id, Math.round((found?.averageBitrate ?? 0) / 1000)]));
	} finally {
		input.dispose();
	}
}

/** Encoders want even sizes. */
function even(value: number): number {
	return Math.max(2, Math.round(value / 2) * 2);
}

/** The shorter side of a picture: what "720p" measures, upright or on its side. */
export function shortSide(size: Size): number {
	return Math.min(size.width, size.height);
}

/**
 * Size of the exported pictures: the crop, brought down so its shorter side is the chosen
 * height, as "720p" means 1280 × 720 across and 720 × 1280 upright.
 */
export function outputSize(picture: ImageDoc, upright: Size, height: number | null): Size {
	const crop = effectiveCrop(picture, upright);
	const scale = height === null ? 1 : Math.min(1, height / shortSide(crop));
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

/**
 * Draws each picture with the edits at the output size, as the preview does: the picture, the
 * text and stickers shown at its time, then the subtitles on top.
 */
class PictureProcessor {
	private readonly canvas: OffscreenCanvas;
	private readonly renderer: ImageRenderer;
	/** Where text, stickers and subtitles are drawn over the picture, when there are some. */
	private readonly composite: { canvas: OffscreenCanvas; context: OffscreenCanvasRenderingContext2D } | null;

	constructor(
		private readonly picture: ImageDoc,
		private readonly upright: Size,
		size: Size,
		private readonly burner: SubtitleBurner | null,
	) {
		this.canvas = new OffscreenCanvas(size.width, size.height);
		this.renderer = new ImageRenderer(this.canvas);
		const layered = burner !== null || picture.overlays.length > 0;
		const canvas = layered ? new OffscreenCanvas(size.width, size.height) : null;
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
		this.renderer.render(this.picture, { region: effectiveCrop(this.picture, this.upright), seed: time * 97 });
		if (!this.composite) return new VideoSample(this.canvas, { timestamp, duration: sample.duration });
		const { canvas, context } = this.composite;
		context.clearRect(0, 0, canvas.width, canvas.height);
		context.drawImage(this.canvas, 0, 0);
		drawOverlays(context, this.picture.overlays, canvas, time);
		if (this.burner) await this.burner.draw(context, time);
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

/** Metadata tags for a conversion: the file's, with the edited ones in their place. */
function conversionTags(meta: VideoMeta | null) {
	return meta ? (tags: MetadataTags) => writeMeta(tags, meta) : undefined;
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
	const change = pictureChange(doc.picture);
	const drawn = change !== 'none' || burner !== null;
	// Text and stickers are drawn with their fonts and pictures, loaded before the first frame.
	if (doc.picture.overlays.length > 0) await loadOverlayAssets(doc.picture.overlays);
	const size = outputSize(doc.picture, job.upright, settings.height);
	// Conversion times start at the trim; the edit's ranges are in source time.
	const offset = isShortened(doc) ? doc.trim.start : 0;
	let processor: PictureProcessor | null = null;

	const video = (track: InputVideoTrack): ConversionVideoOptions => {
		if (track.number > 1) return { discard: true };
		const options: ConversionVideoOptions = {
			codec: settings.codec,
			quality: videoQuality(settings),
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
		// hiding the pictures before. Turns and mirrors are written for players to apply.
		const turn = change === 'turn' ? editTurn(doc.picture) : null;
		const copy = (track: InputAudioTrack) => (job.audioTracks.has(track.id) ? {} : { discard: true });
		try {
			const conversion = await Conversion.init({
				input,
				output,
				trim: isShortened(doc) ? { start: doc.trim.start, end: doc.trim.end } : undefined,
				video: (track) =>
					track.number > 1 ? { discard: true } : turn ? { rotate: turn.rotation, flip: turn.flip } : {},
				audio: copy,
				tags: conversionTags(doc.meta),
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
			tags: conversionTags(doc.meta),
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
