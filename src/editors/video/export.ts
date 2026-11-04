import {
	ALL_FORMATS,
	AttachedFile,
	type AudioCodec,
	BlobSource,
	Conversion,
	type ConversionAudioOptions,
	type ConversionVideoOptions,
	canEncodeVideo,
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
import { isKept, toOutput, totalLength } from '@/document/timemap';
import { drawOverlays, loadOverlayAssets } from '@/editor/overlays/draw';
/**
 * Converting a video: its pictures encoded again with the editor's cuts, crop, turns and colours,
 * its sound copied or encoded again, through Mediabunny's Conversion. The pictures are drawn by
 * the same WebGL renderer as the preview, so the file looks like what was on screen.
 */
import { canDecode } from '@/media/decoders';
import { containerHdr } from '@/media/report/container';
import { changesSound, type SoundChanges } from '@/media/sound';
import type { LogoId } from '@/ui/BrandLogo';
import { ensureEncoder } from '../audio/export';
import { effectiveCrop, type ImageDoc, type Size } from '../image/document';
import { ImageRenderer } from '../image/renderer';
import { gainOf, PieceSound, placeAudio, placeRanges } from './audio-pieces';
import { AudioShaper } from './audio-shaping';
import { type BurnJob, type Box, createBurner, type SubtitleBurner } from './burn';
import {
	editTurn,
	fadeLevel,
	fadeOf,
	pictureChange,
	speedOf,
	timeShaped,
	type Turn,
	type VideoDoc,
	type VideoMeta,
} from './document';

export type VideoContainer = 'mp4' | 'mov' | 'mkv' | 'webm';
export type VideoCodecId = 'avc' | 'hevc' | 'vp9' | 'av1';
/** The sound as it is, or encoded again. */
export type AudioChoice = 'copy' | 'aac' | 'opus';
/**
 * How the pictures' bitrate is set: from the source (as much as it needs, for its quality and the
 * codec written), from a quality level whatever the bitrate it takes (as FFmpeg's CRF), or by hand.
 */
export type RateControl = 'auto' | 'quality' | 'bitrate';

export interface VideoExportSettings {
	/** Copy the tracks as they are, or encode the pictures again. */
	mode: 'copy' | 'encode';
	container: VideoContainer;
	codec: VideoCodecId;
	/** Shorter side of the output, as in "720p"; null keeps the crop's. */
	height: number | null;
	/**
	 * Under a size limit, `height` is a ceiling: the pictures come out smaller when the limit leaves
	 * too few bits for them to look clean, as a 20 MB minute at 1080p would.
	 */
	adaptive: boolean;
	/** Pictures per second; null keeps the source's. */
	frameRate: number | null;
	rateControl: RateControl;
	/** Highest bitrate from the source, in kb/s: a platform's recommendation; null for none. */
	bitrateCeiling: number | null;
	/** Video bitrate, in kb/s, when set by hand. */
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
	/** Encoded on the graphics card or on the processor. */
	encoder: VideoEncoderKind;
	/** Seconds between key frames, as the platform asks; null leaves Mediabunny's 5 s. */
	keyframes: number | null;
}

export type VideoEncoderKind = 'gpu' | 'software';

/** Codecs this browser encodes at a size, on the graphics card and on the processor. */
export interface VideoEncoders {
	gpu: VideoCodecId[];
	software: VideoCodecId[];
	/** Those it also encodes in 10 bits: HEVC and AV1 only, where the browser takes it. */
	deep?: { gpu: VideoCodecId[]; software: VideoCodecId[] };
}

/** Codecs always written in 10 bits when the encoder takes it: finer gradients for fewer bits. */
const DEEP_CODECS: ReadonlySet<VideoCodecId> = new Set(['hevc', 'av1']);

/** Whether the pictures go out in 10 bits with this codec on this encoder. */
export function bitDepthOf(encoders: VideoEncoders, codec: VideoCodecId, encoder: VideoEncoderKind): 8 | 10 {
	return encoders.deep?.[encoder].includes(codec) ? 10 : 8;
}

const ENCODER_ORDER: VideoEncoderKind[] = ['gpu', 'software'];

export const CONTAINERS: Record<
	VideoContainer,
	{
		label: string;
		extension: string;
		mime: string;
		codecs: VideoCodecId[];
		audio: AudioCodec[];
		/** `fastStart` puts the index first, for players and services to start before the end. */
		create: (fastStart?: boolean) => OutputFormat;
	}
> = {
	mp4: {
		label: 'MP4',
		extension: 'mp4',
		mime: 'video/mp4',
		codecs: ['avc', 'hevc', 'vp9', 'av1'],
		audio: ['aac', 'opus', 'mp3', 'flac', 'ac3', 'eac3'],
		// The index goes at the end, written as the file grows, unless the file is small enough to
		// be held in memory until it is put first.
		create: (fastStart = false) => new Mp4OutputFormat({ fastStart: fastStart ? 'in-memory' : false }),
	},
	mov: {
		label: 'MOV',
		extension: 'mov',
		mime: 'video/quicktime',
		codecs: ['avc', 'hevc'],
		audio: ['aac', 'mp3', 'ac3', 'eac3'],
		create: (fastStart = false) => new MovOutputFormat({ fastStart: fastStart ? 'in-memory' : false }),
	},
	mkv: {
		label: 'MKV',
		extension: 'mkv',
		mime: 'video/x-matroska',
		codecs: ['avc', 'hevc', 'vp9', 'av1'],
		// TrueHD, lossless, is kept as it is: only Matroska takes it.
		audio: ['aac', 'opus', 'mp3', 'flac', 'vorbis', 'ac3', 'eac3', 'truehd'],
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
 * would say the old title; attached files other than pictures stay (subtitle fonts). The moment
 * of the export isn't written: it says when the person worked, and nothing of the video.
 */
export function writeMeta(tags: MetadataTags, meta: VideoMeta | null): MetadataTags {
	if (!meta) return { ...tags, creationTime: null };
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
		creationTime: null,
	};
}

/** The quality levels offered, from best to worst. */
export const QUALITY_LEVELS = [1, 0.75, 0.5, 0.25, 0] as const;

/**
 * The quantizer of each quality level, per codec, as encoders count it: QP for H.264 and HEVC,
 * 0 to 63 for VP9, AV1's q-index from 0 to 255. "High" sits where x264's CRF 21 does: no visible
 * loss at a normal viewing distance. Hardware encoders keep these as a constant QP, without their
 * adaptive quantization, so the levels lean a little towards quality.
 */
const QUANTIZERS: Record<VideoCodecId, Record<(typeof QUALITY_LEVELS)[number], number>> = {
	avc: { 1: 18, 0.75: 22, 0.5: 26, 0.25: 30, 0: 34 },
	hevc: { 1: 20, 0.75: 24, 0.5: 28, 0.25: 32, 0: 36 },
	vp9: { 1: 24, 0.75: 31, 0.5: 37, 0.25: 43, 0: 49 },
	av1: { 1: 88, 0.75: 116, 0.5: 140, 0.25: 164, 0: 188 },
};

export function quantizerFor(codec: VideoCodecId, quality: number): number {
	const level = QUALITY_LEVELS.reduce((best, candidate) =>
		Math.abs(candidate - quality) < Math.abs(best - quality) ? candidate : best,
	);
	return QUANTIZERS[codec][level];
}

/**
 * The video's rate control for Mediabunny. A quality level is a quantizer, its bitrate the
 * fallback for encoders without one. A bitrate is variable (the encoder spends bits where the
 * pictures need them); `strict` keeps it constant, for a second try under a size limit.
 */
function videoQuality(settings: VideoExportSettings, strict: boolean): Quality {
	if (settings.rateControl === 'quality' && settings.sizeLimit === null)
		return new Quality({
			quantizer: quantizerFor(settings.codec, settings.quality),
			bitrate: settings.bitrate * 1000,
		});
	return new Quality({ bitrate: settings.bitrate * 1000, bitrateMode: strict ? 'constant' : 'variable' });
}

function isCodecId(codec: VideoCodec | null): codec is VideoCodecId {
	return codec === 'avc' || codec === 'hevc' || codec === 'vp9' || codec === 'av1';
}

/**
 * Codecs this browser encodes, for pictures of this size, on the graphics card and on the
 * processor. The browser answers for its hardware: AV1 is only on the cards that encode it (an
 * NVIDIA RTX 40, an Intel Arc, a Radeon RX 7000), HEVC often only on the card.
 */
export async function videoEncoders(size: Size): Promise<VideoEncoders> {
	const codecs: VideoCodecId[] = ['avc', 'hevc', 'vp9', 'av1'];
	const on = async (hardwareAcceleration: Acceleration, bitDepth: 8 | 10, among: readonly VideoCodecId[]) => {
		const found = await Promise.all(
			among.map(
				async (codec) =>
					(await canEncodeVideo(codec, { ...size, hardwareAcceleration, bitDepth }).catch(() => false)) &&
					(bitDepth === 8 || (await encodesDeep(codec, hardwareAcceleration))),
			),
		);
		return among.filter((_, k) => found[k]);
	};
	const [gpu, software] = await Promise.all([on('prefer-hardware', 8, codecs), on('prefer-software', 8, codecs)]);
	const [deepGpu, deepSoftware] = await Promise.all([
		on(
			'prefer-hardware',
			10,
			gpu.filter((codec) => DEEP_CODECS.has(codec)),
		),
		on(
			'prefer-software',
			10,
			software.filter((codec) => DEEP_CODECS.has(codec)),
		),
	]);
	return { gpu, software, deep: { gpu: deepGpu, software: deepSoftware } };
}

type Acceleration = 'prefer-hardware' | 'prefer-software';

/** Codec strings of a small 10-bit test: HEVC Main 10, level 3.1; AV1 Main, level 3.0, 10 bits. */
const DEEP_PROBES: Partial<Record<VideoCodecId, VideoEncoderConfig>> = {
	hevc: { codec: 'hvc1.2.4.L93.B0', width: 640, height: 360 },
	av1: { codec: 'av01.0.04M.10', width: 640, height: 360 },
};

/**
 * Whether a 10-bit encoder really encodes. Browsers may say yes to the configuration and fail on
 * the first picture (Chrome behind its flags): one picture is encoded to know.
 */
async function encodesDeep(codec: VideoCodecId, hardwareAcceleration: Acceleration): Promise<boolean> {
	const probe = DEEP_PROBES[codec];
	if (!probe || typeof VideoEncoder === 'undefined' || typeof OffscreenCanvas === 'undefined') return false;
	const config: VideoEncoderConfig = { ...probe, bitrate: 1_000_000, framerate: 30, hardwareAcceleration };
	if (!(await VideoEncoder.isConfigSupported(config).catch(() => null))?.supported) return false;
	let chunks = 0;
	let failed = false;
	const encoder = new VideoEncoder({
		output: () => {
			chunks += 1;
		},
		error: () => {
			failed = true;
		},
	});
	try {
		encoder.configure(config);
		const canvas = new OffscreenCanvas(probe.width, probe.height);
		const context = canvas.getContext('2d');
		if (context) {
			context.fillStyle = '#3a6ea5';
			context.fillRect(0, 0, probe.width, probe.height);
		}
		const frame = new VideoFrame(canvas, { timestamp: 0 });
		encoder.encode(frame, { keyFrame: true });
		frame.close();
		await Promise.race([encoder.flush(), new Promise((resolve) => setTimeout(resolve, 4000))]);
		return !failed && chunks > 0;
	} catch {
		return false;
	} finally {
		if (encoder.state !== 'closed') encoder.close();
	}
}

/**
 * The codec and encoder to write with, among the codecs a container takes: the wanted codec on
 * the wanted encoder if it can, else the same codec on the other one, else another codec.
 */
export function chooseEncoding(
	encoders: VideoEncoders,
	codecs: readonly VideoCodecId[],
	codec: VideoCodecId | null,
	encoder: VideoEncoderKind | null,
): { codec: VideoCodecId; encoder: VideoEncoderKind } {
	const order = encoder === 'software' ? ENCODER_ORDER.toReversed() : ENCODER_ORDER;
	for (const kind of order) {
		if (codec && codecs.includes(codec) && encoders[kind].includes(codec)) return { codec, encoder: kind };
	}
	for (const kind of order) {
		const found = codecs.find((candidate) => encoders[kind].includes(candidate));
		if (found) return { codec: found, encoder: kind };
	}
	return { codec: codecs[0] ?? 'avc', encoder: 'software' };
}

/** Whether the sound can be copied into the container: its codec must fit. */
export function audioFits(source: VideoSource, container: VideoContainer): boolean {
	return source.audioCodec === null || CONTAINERS[container].audio.includes(source.audioCodec);
}

/**
 * The sound as it will be written: copied when asked and possible, else encoded in the codec the
 * container takes. With passages removed, the sound of each kept part is copied on its own.
 */
export function resolveAudio(settings: VideoExportSettings, source: VideoSource): AudioChoice {
	if (settings.audio !== 'copy') return settings.container === 'webm' ? 'opus' : settings.audio;
	if (audioFits(source, settings.container)) return 'copy';
	return settings.container === 'webm' ? 'opus' : 'aac';
}

/**
 * Settings that reproduce the source: same container, codec, frame rate and bitrate, the sound
 * copied. A codec this browser can't encode falls back to one it can.
 */
export function settingsFromSource(
	source: VideoSource,
	encoders: VideoEncoders,
	encoder: VideoEncoderKind | null = null,
): VideoExportSettings {
	const container = source.container;
	const wanted = isCodecId(source.codec) ? source.codec : null;
	return {
		mode: 'copy',
		container,
		...chooseEncoding(encoders, CONTAINERS[container].codecs, wanted, encoder),
		height: null,
		adaptive: false,
		frameRate: null,
		rateControl: 'auto',
		bitrateCeiling: null,
		bitrate: source.bitrate ?? 5000,
		quality: 0.75,
		audio: audioFits(source, container) ? 'copy' : container === 'webm' ? 'opus' : 'aac',
		audioBitrate: Math.min(320, Math.max(64, source.audioBitrate ?? 160)),
		burn: null,
		sizeLimit: null,
		preset: null,
		keyframes: null,
	};
}

/** Size limits offered, in MB: those of the places videos are sent to, and round figures. */
export const SIZE_LIMITS = [8, 10, 16, 25, 50, 100, 250, 500, 1000];

/** Share of a size limit given to the pictures and sound, the rest left to the container and to encoders overshooting. */
const SIZE_MARGIN = 0.94;

/** Lowest video bitrate a size limit leads to, in kb/s. */
const MIN_BITRATE = 50;

/**
 * The video bitrate (kb/s) that keeps a file of `seconds` under `megabytes`, the sound taking
 * `audio` kb/s. MB are counted in millions of bytes, below what services mean by it either way.
 */
export function bitrateForSize(megabytes: number, seconds: number, audio: number): number {
	if (seconds <= 0) return MIN_BITRATE;
	const kilobits = (megabytes * 1_000_000 * 8 * SIZE_MARGIN) / 1000;
	return Math.max(MIN_BITRATE, Math.floor(kilobits / seconds - audio));
}

/**
 * The source's video bitrate brought to the output (kb/s): fewer pixels or pictures need fewer
 * bits, by the usual 0.75 power. Null when the file doesn't tell its bitrate.
 */
export function sourceCeiling(
	source: Pick<VideoSource, 'bitrate' | 'frameRate'>,
	upright: Size,
	output: Size,
	frameRate: number | null,
): number | null {
	if (!source.bitrate) return null;
	const pixels = Math.min(1, (output.width * output.height) / (upright.width * upright.height));
	const pictures = frameRate && source.frameRate ? Math.min(1, frameRate / source.frameRate) : 1;
	return Math.round(source.bitrate * (pixels * pictures) ** 0.75);
}

/** The size limits offered, with the one a platform asks for when it is not a round figure. */
export function sizeLimits(current: number | null): number[] {
	return current === null || SIZE_LIMITS.includes(current)
		? SIZE_LIMITS
		: [...SIZE_LIMITS, current].toSorted((a, b) => a - b);
}

/**
 * Size of a file written at these bitrates (kb/s), in MB of a million bytes, with the share the
 * container takes. Encoders keep close to a set bitrate, so this lands within a few percent.
 */
export function estimatedMegabytes(video: number, audio: number, seconds: number): number {
	return ((video + audio) * 1000 * seconds * CONTAINER_SHARE) / 8 / 1_000_000;
}

/** What the container adds to the pictures and sound, as a factor. */
const CONTAINER_SHARE = 1.015;

/**
 * Bits each codec needs for the same look, against H.264: HEVC and VP9 about two thirds, AV1
 * about half. A source in another codec is brought to the one written by these.
 */
const EFFICIENCY: Partial<Record<VideoCodec, number>> = { avc: 1, hevc: 0.65, vp9: 0.7, av1: 0.55, vp8: 1.15 };

/**
 * Bits per pixel and picture: `least` where pictures start to break into blocks, `good` a clean
 * picture when nothing tells what the source needs, `most` beyond which more bits show nothing.
 */
const DENSITY: Record<VideoCodecId, { least: number; good: number; most: number }> = {
	avc: { least: 0.055, good: 0.1, most: 0.22 },
	hevc: { least: 0.036, good: 0.065, most: 0.14 },
	vp9: { least: 0.038, good: 0.07, most: 0.15 },
	av1: { least: 0.03, good: 0.055, most: 0.12 },
};

/** Bitrate in kb/s at a density, for pictures of `size` at `rate` per second. */
function atDensity(density: number, size: Size, rate: number): number {
	return Math.round((density * size.width * size.height * rate) / 1000);
}

/** What the video plan starts from. */
export interface PlanInput {
	settings: VideoExportSettings;
	picture: ImageDoc;
	upright: Size;
	/** Length of the output, in seconds. */
	seconds: number;
	/** Bitrate of the sound tracks together, in kb/s. */
	audio: number;
	source: Pick<VideoSource, 'bitrate' | 'frameRate' | 'codec'>;
}

/** How the pictures will be written, worked out from the settings. */
export interface VideoPlan {
	/** Shorter side, as the settings take it: null keeps the crop's. */
	height: number | null;
	size: Size;
	/** Video bitrate, in kb/s: the one written, or the fallback of a quality level. */
	bitrate: number;
	/** Kept to a quality level rather than to the bitrate. */
	constantQuality: boolean;
	/** The size limit decides the bitrate. */
	limited: boolean;
	/** So few bits per pixel that the pictures will show blocks. */
	squeezed: boolean;
	/** Size of the file in MB, when the bitrate tells it. */
	estimate: number | null;
}

/**
 * The plan of the pictures: their size (brought down under a size limit when `adaptive` and the
 * bits are short), and their bitrate. From the source, the bitrate is what its pictures carry,
 * brought to the size, frame rate and codec written, within what the codec can use. A size limit
 * caps it and never raises it.
 */
export function planVideo({ settings, picture, upright, seconds, audio, source }: PlanInput): VideoPlan {
	const { codec, sizeLimit } = settings;
	const rate = settings.frameRate ?? source.frameRate ?? 30;
	const fits = sizeLimit === null ? null : bitrateForSize(sizeLimit, seconds, audio);
	const density = DENSITY[codec];
	let height = settings.height;
	if (settings.adaptive && fits !== null) {
		const top = shortSide(outputSize(picture, upright, settings.height));
		const heights = [top, ...HEIGHTS.filter((candidate) => candidate < top)];
		height =
			heights.find(
				(candidate) => fits >= atDensity(density.least, outputSize(picture, upright, candidate), rate),
			) ??
			heights.at(-1) ??
			null;
		if (height === top) height = settings.height;
	}
	const size = outputSize(picture, upright, height);
	const fromSource = sourceCeiling(source, upright, size, settings.frameRate);
	const efficiency = (EFFICIENCY[codec] ?? 1) / (source.codec ? (EFFICIENCY[source.codec] ?? 1) : 1);
	const auto = Math.min(
		fromSource === null ? atDensity(density.good, size, rate) : Math.round(fromSource * efficiency),
		atDensity(density.most, size, rate),
		settings.bitrateCeiling ?? Number.POSITIVE_INFINITY,
	);
	const chosen = settings.rateControl === 'bitrate' ? settings.bitrate : Math.max(MIN_BITRATE, auto);
	const limited = fits !== null && fits < chosen;
	const bitrate = limited ? Math.max(MIN_BITRATE, fits) : chosen;
	const constantQuality = settings.rateControl === 'quality' && sizeLimit === null;
	return {
		height,
		size,
		bitrate,
		constantQuality,
		limited,
		squeezed: limited && bitrate < atDensity(density.least, size, rate) * 0.75,
		estimate: constantQuality ? null : estimatedMegabytes(bitrate, audio, seconds),
	};
}

/** The settings with the plan written in: a bitrate or a quality, and a fixed height. */
export function planned(settings: VideoExportSettings, plan: VideoPlan): VideoExportSettings {
	return {
		...settings,
		height: plan.height,
		adaptive: false,
		bitrate: plan.bitrate,
		rateControl: plan.constantQuality ? 'quality' : 'bitrate',
		// The bitrate already keeps under the limit; the limit stays for the encoder's rate mode.
	};
}

export type PresetId =
	| 'discord'
	| 'discord-basic'
	| 'discord-nitro'
	| 'whatsapp'
	| 'telegram'
	| 'signal'
	| 'messenger'
	| 'email'
	| 'tiktok'
	| 'reels'
	| 'shorts'
	| 'snapchat'
	| 'instagram-feed'
	| 'instagram'
	| 'facebook'
	| 'x'
	| 'x-premium'
	| 'threads'
	| 'bluesky'
	| 'linkedin'
	| 'reddit'
	| 'youtube'
	| 'vimeo'
	| 'twitch'
	| 'square'
	| 'uhd'
	| 'web';

type PresetGroupId = 'messages' | 'vertical' | 'social' | 'video' | 'general';

export interface Preset {
	label: string;
	group: PresetGroupId;
	/** The logo shown, a brand's or a generic one. */
	logo: LogoId;
	/** The frame the pictures are cropped to, from the middle; absent keeps theirs. */
	aspect?: `${number}:${number}`;
	container: VideoContainer;
	codec: VideoCodecId;
	/** Highest picture height; smaller pictures keep theirs. */
	maxHeight: number;
	/** Highest frame rate; slower videos keep theirs. */
	maxFrameRate: number;
	/** Video bitrate in kb/s for 1080p at 30 fps, brought to the size and rate written. */
	bitrate: number;
	/** Largest file taken, in MB; null when far beyond what a video here weighs. */
	sizeLimit: number | null;
	/** Longest video taken, in seconds. */
	maxSeconds?: number;
	/** Seconds between key frames, as the platform asks; absent leaves the encoder's. */
	keyframes?: number;
	audio: 'aac' | 'opus';
	audioBitrate: number;
}

/**
 * The places videos are sent to: H.264 and AAC in MP4, which every phone plays and every service
 * takes. Under a size limit the pictures get smaller when a long video leaves them too few bits.
 */
const mp4 = (preset: Omit<Preset, 'container' | 'codec' | 'audio'>): Preset => ({
	container: 'mp4',
	codec: 'avc',
	audio: 'aac',
	...preset,
});

/**
 * Settings for the places videos go, from their published limits (October 2026). Messaging apps
 * play the file as it is sent, up to a size: the picture is kept as large as the size allows.
 * Social networks encode again what they get: they are sent their recommended bitrate, with a key
 * frame every 2 s (YouTube: closed GOPs of half the frame rate). Mail servers take 25 MB, but
 * attachments grow by a third on the way: 18 MB is what fits.
 */
export const PRESETS: Record<PresetId, Preset> = {
	'discord': mp4({
		label: 'Discord',
		group: 'messages',
		logo: 'discord',
		maxHeight: 1080,
		maxFrameRate: 60,
		bitrate: 6000,
		sizeLimit: 20,
		audioBitrate: 128,
	}),
	'discord-basic': mp4({
		label: 'Discord Nitro Basic',
		group: 'messages',
		logo: 'discord',
		maxHeight: 1080,
		maxFrameRate: 60,
		bitrate: 8000,
		sizeLimit: 50,
		audioBitrate: 160,
	}),
	'discord-nitro': mp4({
		label: 'Discord Nitro',
		group: 'messages',
		logo: 'discord',
		maxHeight: 2160,
		maxFrameRate: 60,
		bitrate: 10000,
		sizeLimit: 500,
		audioBitrate: 192,
	}),
	'whatsapp': mp4({
		label: 'WhatsApp',
		group: 'messages',
		logo: 'whatsapp',
		// WhatsApp shows videos at 720p at most, in HD; it compresses anything larger again.
		maxHeight: 720,
		maxFrameRate: 30,
		bitrate: 4000,
		sizeLimit: 16,
		audioBitrate: 128,
	}),
	'telegram': mp4({
		label: 'Telegram',
		group: 'messages',
		logo: 'telegram',
		maxHeight: 1080,
		maxFrameRate: 60,
		bitrate: 6000,
		sizeLimit: 2000,
		audioBitrate: 160,
	}),
	'signal': mp4({
		label: 'Signal',
		group: 'messages',
		logo: 'signal',
		maxHeight: 1080,
		maxFrameRate: 30,
		bitrate: 5000,
		sizeLimit: 100,
		audioBitrate: 128,
	}),
	'messenger': mp4({
		label: 'Messenger',
		group: 'messages',
		logo: 'messenger',
		maxHeight: 1080,
		maxFrameRate: 30,
		bitrate: 5000,
		sizeLimit: 25,
		audioBitrate: 128,
	}),
	'email': mp4({
		label: 'E-mail',
		group: 'messages',
		logo: 'email',
		maxHeight: 1080,
		maxFrameRate: 30,
		bitrate: 4000,
		sizeLimit: 18,
		audioBitrate: 96,
	}),
	'tiktok': mp4({
		label: 'TikTok',
		group: 'vertical',
		logo: 'tiktok',
		aspect: '9:16',
		maxHeight: 1080,
		maxFrameRate: 60,
		bitrate: 10000,
		sizeLimit: null,
		maxSeconds: 3600,
		keyframes: 2,
		audioBitrate: 192,
	}),
	'reels': mp4({
		label: 'Instagram Reels',
		group: 'vertical',
		logo: 'instagram',
		aspect: '9:16',
		maxHeight: 1080,
		maxFrameRate: 60,
		bitrate: 9000,
		sizeLimit: 4000,
		maxSeconds: 900,
		keyframes: 2,
		audioBitrate: 192,
	}),
	'shorts': mp4({
		label: 'YouTube Shorts',
		group: 'vertical',
		logo: 'youtubeshorts',
		aspect: '9:16',
		maxHeight: 1080,
		maxFrameRate: 60,
		bitrate: 8000,
		sizeLimit: null,
		maxSeconds: 180,
		keyframes: 0.5,
		audioBitrate: 256,
	}),
	'snapchat': mp4({
		label: 'Snapchat',
		group: 'vertical',
		logo: 'snapchat',
		aspect: '9:16',
		maxHeight: 1080,
		maxFrameRate: 30,
		bitrate: 6000,
		sizeLimit: null,
		maxSeconds: 180,
		keyframes: 2,
		audioBitrate: 128,
	}),
	'instagram-feed': mp4({
		label: 'Instagram 4:5',
		group: 'social',
		logo: 'instagram',
		aspect: '4:5',
		maxHeight: 1080,
		maxFrameRate: 60,
		bitrate: 9000,
		sizeLimit: 4000,
		maxSeconds: 900,
		keyframes: 2,
		audioBitrate: 192,
	}),
	'instagram': mp4({
		label: 'Instagram',
		group: 'social',
		logo: 'instagram',
		maxHeight: 1080,
		maxFrameRate: 60,
		bitrate: 9000,
		sizeLimit: 4000,
		maxSeconds: 900,
		keyframes: 2,
		audioBitrate: 192,
	}),
	'facebook': mp4({
		label: 'Facebook',
		group: 'social',
		logo: 'facebook',
		maxHeight: 2160,
		maxFrameRate: 60,
		bitrate: 8000,
		sizeLimit: 10000,
		keyframes: 2,
		audioBitrate: 192,
	}),
	'x': mp4({
		label: 'X',
		group: 'social',
		logo: 'x',
		maxHeight: 1080,
		maxFrameRate: 60,
		bitrate: 8000,
		sizeLimit: 512,
		maxSeconds: 140,
		keyframes: 2,
		audioBitrate: 128,
	}),
	'x-premium': mp4({
		label: 'X Premium',
		group: 'social',
		logo: 'x',
		maxHeight: 1080,
		maxFrameRate: 60,
		bitrate: 10000,
		sizeLimit: 8000,
		keyframes: 2,
		audioBitrate: 192,
	}),
	'threads': mp4({
		label: 'Threads',
		group: 'social',
		logo: 'threads',
		maxHeight: 1080,
		maxFrameRate: 60,
		bitrate: 8000,
		sizeLimit: 1000,
		maxSeconds: 300,
		keyframes: 2,
		audioBitrate: 160,
	}),
	'bluesky': mp4({
		label: 'Bluesky',
		group: 'social',
		logo: 'bluesky',
		maxHeight: 1080,
		maxFrameRate: 60,
		bitrate: 6000,
		sizeLimit: 300,
		maxSeconds: 600,
		keyframes: 2,
		audioBitrate: 160,
	}),
	'linkedin': mp4({
		label: 'LinkedIn',
		group: 'social',
		logo: 'linkedin',
		maxHeight: 1080,
		maxFrameRate: 60,
		bitrate: 8000,
		sizeLimit: 5000,
		maxSeconds: 900,
		keyframes: 2,
		audioBitrate: 160,
	}),
	'reddit': mp4({
		label: 'Reddit',
		group: 'social',
		logo: 'reddit',
		maxHeight: 1080,
		maxFrameRate: 60,
		bitrate: 8000,
		sizeLimit: 1000,
		maxSeconds: 900,
		keyframes: 2,
		audioBitrate: 160,
	}),
	'youtube': mp4({
		label: 'YouTube',
		group: 'video',
		logo: 'youtube',
		maxHeight: 2160,
		maxFrameRate: 60,
		bitrate: 8000,
		sizeLimit: null,
		keyframes: 0.5,
		audioBitrate: 384,
	}),
	'vimeo': mp4({
		label: 'Vimeo',
		group: 'video',
		logo: 'vimeo',
		maxHeight: 2160,
		maxFrameRate: 60,
		bitrate: 16000,
		sizeLimit: null,
		keyframes: 2,
		audioBitrate: 320,
	}),
	'twitch': mp4({
		label: 'Twitch',
		group: 'video',
		logo: 'twitch',
		maxHeight: 1080,
		maxFrameRate: 60,
		bitrate: 6000,
		sizeLimit: null,
		keyframes: 2,
		audioBitrate: 160,
	}),
	'square': mp4({
		label: '1:1',
		group: 'general',
		logo: 'square',
		aspect: '1:1',
		maxHeight: 1080,
		maxFrameRate: 60,
		bitrate: 8000,
		sizeLimit: null,
		audioBitrate: 160,
	}),
	'uhd': {
		label: '4K UHD',
		group: 'general',
		logo: 'uhd',
		container: 'mp4',
		codec: 'hevc',
		maxHeight: 2160,
		maxFrameRate: 60,
		bitrate: 6000,
		sizeLimit: null,
		audio: 'aac',
		audioBitrate: 256,
	},
	'web': {
		label: 'Web',
		group: 'general',
		logo: 'web',
		container: 'webm',
		codec: 'av1',
		maxHeight: 1080,
		maxFrameRate: 60,
		bitrate: 3000,
		sizeLimit: null,
		keyframes: 2,
		audio: 'opus',
		audioBitrate: 128,
	},
};

/** Presets in the order they are listed: by group, the free version of a service first. */
export const PRESET_ORDER: PresetId[] = [
	'discord',
	'discord-basic',
	'discord-nitro',
	'whatsapp',
	'telegram',
	'signal',
	'messenger',
	'email',
	'tiktok',
	'reels',
	'shorts',
	'snapchat',
	'instagram-feed',
	'instagram',
	'facebook',
	'x',
	'x-premium',
	'threads',
	'bluesky',
	'linkedin',
	'reddit',
	'youtube',
	'vimeo',
	'twitch',
	'square',
	'uhd',
	'web',
];

/** YouTube's recommended bitrates for SDR uploads, by height (at 30 fps; half again above). */
function uploadBitrate(height: number, frameRate: number): number {
	const base = height >= 2160 ? 40000 : height >= 1440 ? 16000 : height >= 1080 ? 8000 : height >= 720 ? 5000 : 2500;
	return frameRate > 30 ? Math.round(base * 1.5) : base;
}

/** A preset's bitrate for pictures `height` high at `frameRate`: its 1080p30 one, scaled. */
function presetBitrate(id: PresetId, height: number, frameRate: number): number {
	if (id === 'youtube' || id === 'shorts') return uploadBitrate(height, frameRate);
	const pixels = (height / 1080) ** 2;
	return Math.round((PRESETS[id].bitrate * pixels ** 0.75 * (frameRate > 30 ? 1.5 : 1)) / 100) * 100;
}

/**
 * The settings a preset gives a video whose pictures are `height` high: never enlarged, never
 * faster than the source, the bitrate as much as the source needs up to the platform's. Under a
 * size limit, the height is a ceiling the pictures come down from when the bits are short. A
 * codec this browser can't encode falls back to one it can.
 */
export function presetSettings(
	id: PresetId,
	source: VideoSource,
	encoders: VideoEncoders,
	height: number,
	encoder: VideoEncoderKind | null = null,
): Partial<VideoExportSettings> {
	const preset = PRESETS[id];
	const outHeight = Math.min(height, preset.maxHeight);
	const rate = Math.min(source.frameRate ?? 30, preset.maxFrameRate);
	return {
		mode: 'encode',
		container: preset.container,
		...chooseEncoding(encoders, CONTAINERS[preset.container].codecs, preset.codec, encoder),
		height: height > preset.maxHeight ? (HEIGHTS.find((candidate) => candidate <= preset.maxHeight) ?? null) : null,
		adaptive: preset.sizeLimit !== null,
		frameRate: (source.frameRate ?? 30) > preset.maxFrameRate + 0.5 ? preset.maxFrameRate : null,
		rateControl: 'auto',
		bitrateCeiling: presetBitrate(id, outHeight, rate),
		sizeLimit: preset.sizeLimit,
		keyframes: preset.keyframes ?? null,
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
	if (picture.rotation !== 0 || picture.flipX || picture.flipY || picture.angle) return { x: 0, y: 0, ...size };
	const crop = effectiveCrop(picture, upright);
	const scale = size.width / crop.width;
	return { x: -crop.x * scale, y: -crop.y * scale, width: upright.width * scale, height: upright.height * scale };
}

/**
 * Draws each picture with the edits at the output size, as the preview does: the picture, the
 * text and stickers shown at its time, then the subtitles on top.
 */
export class PictureProcessor {
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

	/**
	 * The picture at `timestamp` in the output, `time` in the source, lasting `duration`, `level`
	 * visible (1 but in a fade).
	 */
	async draw(
		sample: VideoSample,
		timestamp: number,
		time: number,
		duration: number,
		level = 1,
	): Promise<VideoSample> {
		this.renderer.setFrame(
			sample.toCanvasImageSource(),
			{ width: sample.squarePixelWidth, height: sample.squarePixelHeight },
			sample.rotation,
		);
		this.renderer.render(this.picture, {
			region: effectiveCrop(this.picture, this.upright),
			seed: time * 97,
			time,
			// Over text and subtitles, the fade darkens the whole picture once drawn.
			fade: this.composite ? 1 : level,
		});
		if (!this.composite) return new VideoSample(this.canvas, { timestamp, duration });
		const { canvas, context } = this.composite;
		context.clearRect(0, 0, canvas.width, canvas.height);
		context.drawImage(this.canvas, 0, 0);
		drawOverlays(context, this.picture.overlays, canvas, time);
		if (this.burner) await this.burner.draw(context, time);
		if (level < 1) {
			context.fillStyle = `rgb(0 0 0 / ${1 - level})`;
			context.fillRect(0, 0, canvas.width, canvas.height);
		}
		return new VideoSample(canvas, { timestamp, duration });
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

/** How a sound track changes: its level in dB, and its equalizer and compressor. */
export interface TrackSound {
	decibels: number;
	sound: SoundChanges | null;
	/** Encoded again in this codec and bitrate, whatever the export's sound settings. */
	encode?: TrackEncode | null;
}

/** A sound track encoded again on its own terms: its codec, and its bitrate in kb/s. */
export interface TrackEncode {
	codec: 'aac' | 'opus';
	bitrate: number;
}

/** A sound track kept as it is. */
export const SOUND_AS_IS: TrackSound = { decibels: 0, sound: null };

/** Whether a sound track changes, and so is decoded and encoded again. */
function soundChanges(track: TrackSound): boolean {
	return track.decibels !== 0 || (track.sound !== null && changesSound(track.sound)) || Boolean(track.encode);
}

export interface ConvertJob {
	file: File;
	doc: VideoDoc;
	settings: VideoExportSettings;
	/** Size of the source's pictures, upright. */
	upright: Size;
	/** Audio tracks kept, by the IDs the file gives them, with how their sound changes. */
	audioTracks: ReadonlyMap<number, TrackSound>;
	/** Subtitles burned into the pictures. */
	burn?: BurnJob | null;
	/** Bit depth of the pictures: 10 where the encoder takes it, for HEVC and AV1. */
	bitDepth?: 8 | 10;
	/** The bitrate kept constant: a second try under a size limit the first one went over. */
	strict?: boolean;
	/** The index written first (MP4, MOV): the file is held in memory until the end. */
	fastStart?: boolean;
}

/** Largest file written with its index first, in MB: it is held in memory until the end. */
export const FAST_START_LIMIT = 512;

/** Metadata tags for a conversion: the file's, with the edited ones in their place. */
function conversionTags(meta: VideoMeta | null) {
	return (tags: MetadataTags) => writeMeta(tags, meta);
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
	// A batch comes here without the file having been opened: its decoders load now.
	const tracks = (await input.getTracks()).filter((track) => track.isVideoTrack() || track.isAudioTrack());
	await Promise.all(tracks.map(canDecode));
	const output = new Output({ format: CONTAINERS[settings.container].create(job.fastStart), target });
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
	const speed = speedOf(doc);
	const fade = fadeOf(doc);
	const fading = fade.in > 0 || fade.out > 0;
	const shaped = timeShaped(doc);
	// The output's length, for the fade out: what is kept, at its new pace.
	const length = totalLength(ranges) / speed;
	const drawn = change !== 'none' || burner !== null || fading;
	// Text and stickers are drawn with their fonts and pictures, loaded before the first frame.
	if (doc.picture.overlays.length > 0) await loadOverlayAssets(doc.picture.overlays);
	const size = outputSize(doc.picture, job.upright, settings.height);
	// Conversion times start at the trim; the edit's ranges are in source time.
	const offset = isShortened(doc) ? doc.trim.start : 0;
	let processor: PictureProcessor | null = null;
	// Played faster, pictures come closer together: kept at the source's rate, the extra ones go.
	let sourceRate: number | undefined;
	if (speed !== 1 && settings.frameRate === null) {
		const stats = await (await input.getPrimaryVideoTrack())?.computePacketStats(120);
		sourceRate = stats ? Math.round(stats.averagePacketRate * 1000) / 1000 : undefined;
	}

	const video = (track: InputVideoTrack): ConversionVideoOptions => {
		if (track.number > 1) return { discard: true };
		const options: ConversionVideoOptions = {
			codec: settings.codec,
			quality: videoQuality(settings, job.strict ?? false),
			hardwareAcceleration: settings.encoder === 'gpu' ? 'prefer-hardware' : 'prefer-software',
			frameRate: settings.frameRate ?? sourceRate,
			keyFrameInterval: settings.keyframes ?? undefined,
			bitDepth: job.bitDepth === 10 && DEEP_CODECS.has(settings.codec) ? 10 : undefined,
			forceTranscode: true,
		};
		if (!drawn && !cuts && speed === 1) return { ...options, width: size.width, height: size.height, fit: 'fill' };
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
			const timestamp = (cuts ? toOutput(ranges, time) : sample.timestamp) / speed;
			if (processor) {
				return processor.draw(
					sample,
					timestamp,
					time,
					sample.duration / speed,
					fadeLevel(fade, timestamp, length),
				);
			}
			const moved = sample.clone();
			moved.setTimestamp(timestamp);
			return moved;
		};
		return options;
	};

	const placed = placeRanges(ranges);
	const audio = (track: InputAudioTrack): ConversionAudioOptions => {
		const edit = job.audioTracks.get(track.id);
		if (edit === undefined) return { discard: true };
		// Removed passages and sound changes are made on decoded sound: it is then encoded again.
		const copy = settings.audio === 'copy' && !cuts && !soundChanges(edit) && !shaped;
		const options: ConversionAudioOptions = copy
			? {}
			: edit.encode
				? { codec: edit.encode.codec, quality: new Quality({ bitrate: edit.encode.bitrate * 1000 }) }
				: {
						codec:
							settings.audio === 'copy'
								? settings.container === 'webm'
									? 'opus'
									: 'aac'
								: settings.audio,
						quality: new Quality({ bitrate: settings.audioBitrate * 1000 }),
					};
		const gain = gainOf(edit.decibels);
		const placing = cuts || gain !== 1;
		const shaper = shaped ? new AudioShaper(speed, fade, length) : null;
		const sound = edit.sound && changesSound(edit.sound) ? new PieceSound(edit.sound) : null;
		if (placing || shaper || sound) {
			options.process = (sample) => {
				const pieces = placing ? placeAudio(sample, placed, offset, gain) : [sample];
				const changed = sound ? sound.apply(pieces, sample) : pieces;
				return shaper ? shaper.shape(changed, sample) : changed;
			};
		}
		return options;
	};

	if (settings.mode === 'copy') {
		// Packets copied as they are: only the trim applies. MP4 starts exactly at it, an edit list
		// hiding the pictures before. Turns and mirrors are written for players to apply.
		const turn = change === 'turn' ? editTurn(doc.picture) : null;
		const copy = (track: InputAudioTrack) => (job.audioTracks.has(track.id) ? {} : { discard: true });
		// The pictures are copied as they are: so is what the container says of their HDR.
		const hdr = await containerHdr(job.file).catch(() => undefined);
		try {
			const conversion = await Conversion.init({
				input,
				output,
				trim: isShortened(doc) ? { start: doc.trim.start, end: doc.trim.end } : undefined,
				video: (track) =>
					track.number > 1
						? { discard: true }
						: turn
							? { rotate: turn.rotation, flip: turn.flip, hdr }
							: { hdr },
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
		const tracks = [...job.audioTracks.values()];
		if (
			encodesAac(settings, cuts || shaped || tracks.some(soundChanges)) ||
			tracks.some((track) => track.encode?.codec === 'aac')
		) {
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
