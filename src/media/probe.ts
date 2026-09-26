import { ALL_FORMATS, BlobSource, CanvasSink, Input, type InputVideoTrack } from 'mediabunny';
import type { MediaKind } from '@/editors/registry';
import { loadCore } from '@/wasm/core';
import { canDecodeAudio } from './decoders';

export interface VideoStream {
	codec: string | null;
	width: number;
	height: number;
	fps: number | null;
	/** Lowest and highest rates of a variable frame rate video (phones, screen recordings). */
	variable: { min: number; max: number } | null;
	decodable: boolean;
}

export interface AudioStream {
	codec: string | null;
	sampleRate: number;
	channels: number;
	decodable: boolean;
}

export interface SubtitleCue {
	start: number;
	text: string;
}

/** Camera details read from EXIF, and EXIF ready to embed in an export. */
export interface PhotoMetadata {
	camera: string | null;
	lens: string | null;
	/** As written by the camera: `2026:07:14 18:32:05`. */
	taken: string | null;
	/** Seconds. */
	exposureTime: number | null;
	fNumber: number | null;
	iso: number | null;
	/** Millimetres. */
	focalLength: number | null;
	software: string | null;
	location: { latitude: number; longitude: number } | null;
	/** Rewritten EXIF, orientation removed. Empty when there is nothing worth keeping. */
	exifFull: Uint8Array;
	exifWithoutLocation: Uint8Array;
}

export interface MediaTags {
	title: string | null;
	artist: string | null;
	album: string | null;
}

export interface MediaInfo {
	kind: MediaKind;
	/** Container or file format, as shown to the user: `MP4`, `JPEG`, `SRT`. */
	format: string;
	size: number;
	duration: number | null;
	video: VideoStream | null;
	audio: AudioStream | null;
	/** Still size for images and animated images. */
	dimensions: { width: number; height: number } | null;
	cues: SubtitleCue[] | null;
	/** Descriptive tags embedded in the file, mostly used by audio. */
	tags: MediaTags | null;
	/** EXIF of photos. */
	photo: PhotoMetadata | null;
}

export interface Probe {
	info: MediaInfo;
	/** First frame for visual media. The caller owns it and must close it. */
	poster: ImageBitmap | null;
}

/** Joins make and model without repeating the brand: `Canon Canon EOS R6` becomes `Canon EOS R6`. */
function cameraName(make: string | undefined, model: string | undefined): string | null {
	if (!model) return make ?? null;
	if (!make || model.toLowerCase().startsWith(make.toLowerCase().split(' ')[0] ?? '')) return model;
	return `${make} ${model}`;
}

export async function readPhotoMetadata(file: File): Promise<PhotoMetadata | null> {
	try {
		const core = await loadCore();
		const raw = core.read_metadata(new Uint8Array(await file.arrayBuffer()));
		if (!raw) return null;
		const metadata: PhotoMetadata = {
			camera: cameraName(raw.make, raw.model),
			lens: raw.lens ?? null,
			taken: raw.taken ?? null,
			exposureTime: raw.exposure_time ?? null,
			fNumber: raw.f_number ?? null,
			iso: raw.iso ?? null,
			focalLength: raw.focal_length ?? null,
			software: raw.software ?? null,
			location:
				raw.latitude !== undefined && raw.longitude !== undefined
					? { latitude: raw.latitude, longitude: raw.longitude }
					: null,
			exifFull: raw.exif_full,
			exifWithoutLocation: raw.exif_without_location,
		};
		raw.free();
		return metadata;
	} catch {
		return null;
	}
}

/** Formats the codec worker decodes when the browser can't. Safari reads TIFF, JPEG XL and HEIC itself. */
const CODEC_IMAGE_FORMATS = new Set(['tiff', 'jxl', 'bmp', 'ico', 'heic']);

/** First frame of an image: the browser's decoder first, vixely-image as a fallback. */
export async function decodeStill(file: File, format: string): Promise<ImageBitmap | null> {
	try {
		return await createImageBitmap(file);
	} catch {
		if (!CODEC_IMAGE_FORMATS.has(format)) return null;
	}
	try {
		const { decodeImage } = await import('./image-codec');
		return await createImageBitmap(await decodeImage(new Uint8Array(await file.arrayBuffer()), format));
	} catch {
		return null;
	}
}

/** Reads what the editors need to know about a file, without decoding more than the first frame. */
export async function probe(file: File, kind: MediaKind, format: string): Promise<Probe> {
	const base: MediaInfo = {
		kind,
		format: format.toUpperCase(),
		size: file.size,
		duration: null,
		video: null,
		audio: null,
		dimensions: null,
		cues: null,
		tags: null,
		photo: null,
	};

	if (kind === 'video' || kind === 'audio') return probeTimed(file, base);
	if (kind === 'subtitles') return { info: { ...base, cues: await readCues(file, format) }, poster: null };

	const [poster, photo] = await Promise.all([decodeStill(file, format), readPhotoMetadata(file)]);
	if (!poster) return { info: { ...base, photo }, poster: null };
	return { info: { ...base, photo, dimensions: { width: poster.width, height: poster.height } }, poster };
}

async function probeTimed(file: File, base: MediaInfo): Promise<Probe> {
	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
	try {
		return await readTimed(input, base);
	} finally {
		input.dispose();
	}
}

async function readTimed(input: Input, base: MediaInfo): Promise<Probe> {
	const [container, duration, videoTrack, audioTrack, metadata] = await Promise.all([
		input.getFormat(),
		input.computeDuration(),
		input.getPrimaryVideoTrack(),
		input.getPrimaryAudioTrack(),
		input.getMetadataTags(),
	]);

	let video: VideoStream | null = null;
	let poster: ImageBitmap | null = null;
	if (videoTrack) {
		const [rate, decodable, codec, width, height] = await Promise.all([
			measureFrameRate(videoTrack),
			videoTrack.canDecode(),
			videoTrack.getCodec(),
			videoTrack.getDisplayWidth(),
			videoTrack.getDisplayHeight(),
		]);
		video = { codec, width, height, ...rate, decodable };
		if (decodable) {
			// Some graphics drivers fail on files the browser says it can decode: the CPU tries next,
			// and without a picture the file still opens.
			poster = await pickPoster(videoTrack, duration).catch(async (error: unknown) => {
				console.error('[probe] poster decoding failed (default decoder)', error);
				return pickPoster(videoTrack, duration, 'prefer-software').catch(() => null);
			});
		}
	}

	let audio: AudioStream | null = null;
	if (audioTrack) {
		const [codec, sampleRate, channels, decodable] = await Promise.all([
			audioTrack.getCodec(),
			audioTrack.getSampleRate(),
			audioTrack.getNumberOfChannels(),
			canDecodeAudio(audioTrack),
		]);
		audio = { codec, sampleRate, channels, decodable };
	}

	// Audio files show their cover art where a video would show a frame.
	if (!poster) {
		const images = metadata.images ?? [];
		const cover = images.find((image) => image.kind === 'coverFront') ?? images[0];
		if (cover) {
			try {
				poster = await createImageBitmap(new Blob([cover.data.slice()], { type: cover.mimeType }));
			} catch {
				// A damaged or unsupported cover is not worth failing the whole file over.
			}
		}
	}

	const tags: MediaTags = {
		title: metadata.title?.trim() || null,
		artist: (metadata.artist ?? metadata.albumArtist)?.trim() || null,
		album: metadata.album?.trim() || null,
	};
	const hasTags = tags.title !== null || tags.artist !== null || tags.album !== null;
	const format = shortContainerName(container.name) ?? base.format;
	return { info: { ...base, format, duration, video, audio, tags: hasTags ? tags : null }, poster };
}

/**
 * The frame rate from the timestamps of the first pictures, fitted to the fraction a camera or
 * encoder used (23.976 stays distinct from 24); a variable rate also gives its range.
 */
async function measureFrameRate(track: InputVideoTrack): Promise<Pick<VideoStream, 'fps' | 'variable'>> {
	try {
		const metrics = await track.computeFrameRateMetrics({ targetPacketCount: 300 });
		if (!Number.isFinite(metrics.bestGuessFrameRate) || metrics.bestGuessFrameRate <= 0)
			return { fps: null, variable: null };
		return {
			fps: metrics.bestGuessFrameRate,
			variable:
				metrics.underlyingFrameRate === null && metrics.maxFrameRate - metrics.minFrameRate > 0.5
					? { min: metrics.minFrameRate, max: metrics.maxFrameRate }
					: null,
		};
	} catch {
		return { fps: null, variable: null };
	}
}

/** Below this average luminance (0 to 1) a frame reads as black: fades, intros, title cards. */
const DARK_FRAME = 0.07;

function luminance(source: CanvasImageSource): number {
	const probe = new OffscreenCanvas(16, 9);
	const context = probe.getContext('2d', { willReadFrequently: true });
	if (!context) return 1;
	context.drawImage(source, 0, 0, 16, 9);
	const { data } = context.getImageData(0, 0, 16, 9);
	let sum = 0;
	for (let i = 0; i < data.length; i += 4) {
		sum += 0.2126 * (data[i] ?? 0) + 0.7152 * (data[i + 1] ?? 0) + 0.0722 * (data[i + 2] ?? 0);
	}
	return sum / (data.length / 4) / 255;
}

/**
 * Chooses the frame that represents the video. Many files open on black, so a few moments are
 * tried and the first one that is not dark wins; the brightest candidate is the fallback.
 */
async function pickPoster(
	track: InputVideoTrack,
	duration: number,
	hardwareAcceleration?: 'prefer-software',
): Promise<ImageBitmap | null> {
	const sink = new CanvasSink(track, { poolSize: 1, decoderOptions: { hardwareAcceleration } });
	const start = await track.getFirstTimestamp();
	let best: { bitmap: ImageBitmap; light: number } | null = null;
	for (const fraction of [0.1, 0.25, 0.5]) {
		// Sequential on purpose: stop decoding as soon as a usable frame is found.
		// oxlint-disable-next-line no-await-in-loop
		const frame = await sink.getCanvas(start + (duration - start) * fraction);
		if (!frame) continue;
		const light = luminance(frame.canvas);
		if (best && light <= best.light) continue;
		best?.bitmap.close();
		// oxlint-disable-next-line no-await-in-loop
		best = { bitmap: await createImageBitmap(frame.canvas), light };
		if (light >= DARK_FRAME) break;
	}
	return best?.bitmap ?? null;
}

function shortContainerName(name: string): string | null {
	const known: Record<string, string> = {
		'MP4': 'MP4',
		'QuickTime File Format': 'MOV',
		'Matroska': 'MKV',
		'WebM': 'WebM',
		'Ogg': 'OGG',
		'MP3': 'MP3',
		'WAVE': 'WAV',
		'FLAC': 'FLAC',
		'ADTS': 'AAC',
		'MPEG Transport Stream': 'TS',
	};
	return known[name] ?? null;
}

/**
 * A first, light read of text subtitles: start time and text of each cue. The full parser, with
 * styles and positions, comes with the subtitle editor.
 */
async function readCues(file: File, format: string): Promise<SubtitleCue[] | null> {
	if (format !== 'srt' && format !== 'vtt') return null;
	const text = await file.text();
	const timing = /(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{3})\s*-->/;
	const cues: SubtitleCue[] = [];
	for (const block of text.replace(/\r/g, '').split(/\n{2,}/)) {
		const lines = block.split('\n');
		const index = lines.findIndex((line) => timing.test(line));
		const match = index >= 0 ? timing.exec(lines[index] ?? '') : null;
		if (!match) continue;
		const [, h = '0', mm = '0', ss = '0', ms = '0'] = match;
		cues.push({
			start: Number(h) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms) / 1000,
			text: lines
				.slice(index + 1)
				.join(' ')
				.replace(/<[^>]+>/g, '')
				.trim(),
		});
	}
	return cues;
}
