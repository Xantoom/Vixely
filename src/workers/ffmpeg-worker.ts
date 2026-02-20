import { registerAc3Decoder, registerAc3Encoder } from '@mediabunny/ac3';
import {
	ALL_FORMATS,
	AttachedFile,
	BlobSource,
	BufferTarget,
	CanvasSink,
	Conversion,
	Input,
	MkvOutputFormat,
	Mp4OutputFormat,
	Output,
	WebMOutputFormat,
	type ConversionAudioOptions,
	type ConversionVideoOptions,
	type InputTrack,
	type MetadataTags,
} from 'mediabunny';
import { encodeGif } from '@/modules/gif-editor/encode/gif-encoder.ts';
import { parseMkvSubtitles, type MkvSubtitleTrack } from '@/utils/mkvSubtitleParser.ts';

registerAc3Decoder();
registerAc3Encoder();

// ── Types ──

interface TranscodeMessage {
	type: 'TRANSCODE';
	file: File;
	args: string[];
	outputName: string;
	expectedDurationSec?: number;
}

interface GifMessage {
	type: 'GIF';
	file: File;
	fps: number;
	width: number;
	height?: number;
	startTime?: number;
	duration?: number;
	speed?: number;
	reverse?: boolean;
	maxColors?: number;
}

interface ScreenshotMessage {
	type: 'SCREENSHOT';
	file: File;
	timestamp: number;
}

interface ProbeMessage {
	type: 'PROBE';
	file: File;
}

interface ProbeDetailsMessage {
	type: 'PROBE_DETAILS';
	file: File;
}

interface SubtitlePreviewMessage {
	type: 'SUBTITLE_PREVIEW';
	requestId: number;
	file: File;
	streamIndex: number;
	subtitleCodec?: string;
}

interface ExtractFontsMessage {
	type: 'EXTRACT_FONTS';
	file: File;
	attachments: FontAttachmentInfo[];
}

type WorkerMessage =
	| TranscodeMessage
	| GifMessage
	| ScreenshotMessage
	| ProbeMessage
	| ProbeDetailsMessage
	| SubtitlePreviewMessage
	| ExtractFontsMessage;

interface ProgressPayload {
	type: 'PROGRESS';
	progress: number;
	time: number;
	fps: number;
	frame: number;
	speed: number;
}

interface DonePayload {
	type: 'DONE';
	data: Uint8Array;
	outputName: string;
}

interface ErrorPayload {
	type: 'ERROR';
	error: string;
}

interface ReadyPayload {
	type: 'READY';
}

interface StartedPayload {
	type: 'STARTED';
	job: 'transcode' | 'gif' | 'screenshot';
}

interface LogPayload {
	type: 'LOG';
	message: string;
}

interface ProbeStatusPayload {
	type: 'PROBE_STATUS';
	status: string;
}

interface ProbeResultPayload {
	type: 'PROBE_RESULT';
	result: ProbeResultData;
	fonts: Array<{ name: string; data: Uint8Array }>;
}

interface ProbeDetailsResultPayload {
	type: 'PROBE_DETAILS_RESULT';
	result: DetailedProbeResultData;
}

interface SubtitlePreviewResultPayload {
	type: 'SUBTITLE_PREVIEW_RESULT';
	requestId: number;
	format: 'ass' | 'webvtt';
	content: string;
}

interface FontsResultPayload {
	type: 'FONTS_RESULT';
	fonts: Array<{ name: string; data: Uint8Array }>;
}

export interface ProbeStreamInfo {
	index: number;
	type: 'video' | 'audio' | 'subtitle';
	codec: string;
	width?: number;
	height?: number;
	fps?: number;
	sampleRate?: number;
	channels?: number;
	language?: string;
	title?: string;
	bitrate?: number;
	isDefault?: boolean;
	isForced?: boolean;
	tags?: Record<string, string>;
	disposition?: Record<string, number>;
}

export interface FontAttachmentInfo {
	index: number;
	filename: string;
}

export interface ProbeResultData {
	duration: number;
	bitrate: number;
	format: string;
	streams: ProbeStreamInfo[];
	fontAttachments: FontAttachmentInfo[];
}

export interface DetailedProbeStreamInfo {
	[key: string]: unknown;
	index?: number;
	codec_type?: string;
	codec_name?: string;
	codec_long_name?: string;
	profile?: string;
	codec_tag_string?: string;
	codec_tag?: string;
	width?: number;
	height?: number;
	display_aspect_ratio?: string;
	sample_aspect_ratio?: string;
	pix_fmt?: string;
	color_range?: string;
	color_space?: string;
	color_transfer?: string;
	color_primaries?: string;
	chroma_location?: string;
	bits_per_raw_sample?: string;
	field_order?: string;
	avg_frame_rate?: string;
	r_frame_rate?: string;
	sample_rate?: string;
	channels?: number;
	channel_layout?: string;
	bit_rate?: string;
	duration?: string;
	start_time?: string;
	tags?: Record<string, string>;
	disposition?: Record<string, number>;
}

export interface DetailedProbeResultData {
	format: {
		[key: string]: unknown;
		duration?: string;
		bit_rate?: string;
		format_name?: string;
		format_long_name?: string;
		size?: string;
		probe_score?: number;
		tags?: Record<string, string>;
	};
	streams: DetailedProbeStreamInfo[];
	chapters?: Array<Record<string, unknown>>;
}

type WorkerResponse =
	| ProgressPayload
	| DonePayload
	| ErrorPayload
	| ReadyPayload
	| StartedPayload
	| LogPayload
	| ProbeStatusPayload
	| ProbeResultPayload
	| ProbeDetailsResultPayload
	| SubtitlePreviewResultPayload
	| FontsResultPayload;

type OutputContainer = 'mp4' | 'mkv' | 'webm';

interface ParsedFilterSettings {
	resize?: { width: number; height: number; fit: 'fill' | 'contain' | 'cover' };
	brightness?: number;
	contrast?: number;
	saturation?: number;
	hue?: number;
}

interface ParsedTranscodeSettings {
	container: OutputContainer;
	trimStart?: number;
	trimDuration?: number;
	videoCodec?: ConversionVideoOptions['codec'];
	videoBitrate?: number;
	videoForceTranscode: boolean;
	audioCodec?: ConversionAudioOptions['codec'];
	audioBitrate?: number;
	audioForceTranscode: boolean;
	filters: ParsedFilterSettings;
	includeAllAudio: boolean;
	includeAllSubtitles: boolean;
	explicitTrackIds: Set<number>;
}

const TRANSCODE_VIDEO_CODEC_MAP: Readonly<Record<string, NonNullable<ParsedTranscodeSettings['videoCodec']>>> = {
	libx264: 'avc',
	libx265: 'hevc',
	'libvpx-vp9': 'vp9',
	'libaom-av1': 'av1',
};

const TRANSCODE_AUDIO_CODEC_MAP: Readonly<Record<string, NonNullable<ParsedTranscodeSettings['audioCodec']>>> = {
	aac: 'aac',
	libopus: 'opus',
	opus: 'opus',
};

// ── Helpers ──

function post(payload: WorkerResponse, transfer?: Transferable[]): void {
	if (transfer && transfer.length > 0) {
		self.postMessage(payload, { transfer });
		return;
	}
	self.postMessage(payload);
}

function sendBytesDone(type: 'DONE', data: Uint8Array, outputName?: string): void {
	const copy = new Uint8Array(data);
	post({ type: 'DONE', data: copy, outputName: outputName ?? 'output.bin' }, [copy.buffer]);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function parseFiniteNumber(value: string | undefined): number | undefined {
	if (!value) return undefined;
	const n = Number(value);
	return Number.isFinite(n) ? n : undefined;
}

function parseBitrateToBps(value: string | undefined): number | undefined {
	if (!value) return undefined;
	const raw = value.trim().toLowerCase();
	if (!raw) return undefined;
	const match = raw.match(/^([0-9]*\.?[0-9]+)([kmg])?$/);
	if (!match) {
		const plain = Number(raw);
		return Number.isFinite(plain) && plain > 0 ? plain : undefined;
	}
	const magnitude = Number(match[1]);
	if (!Number.isFinite(magnitude) || magnitude <= 0) return undefined;
	const suffix = match[2];
	const multiplier = suffix === 'g' ? 1_000_000_000 : suffix === 'm' ? 1_000_000 : suffix === 'k' ? 1_000 : 1;
	return Math.round(magnitude * multiplier);
}

function parseOutputContainer(outputName: string): OutputContainer {
	const ext = outputName.split('.').pop()?.toLowerCase();
	if (ext === 'webm') return 'webm';
	if (ext === 'mkv') return 'mkv';
	return 'mp4';
}

async function mapInBatches<T, U>(
	items: readonly T[],
	mapper: (item: T, index: number) => Promise<U>,
	batchSize = 4,
): Promise<U[]> {
	if (items.length === 0) return [];
	const size = Math.max(1, Math.floor(batchSize));
	const results: U[] = Array.from({ length: items.length });

	const runBatch = async (start: number): Promise<void> => {
		if (start >= items.length) return;
		const end = Math.min(items.length, start + size);
		const batchPromises: Promise<U>[] = [];
		for (let index = start; index < end; index += 1) {
			batchPromises.push(mapper(items[index]!, index));
		}
		const batchResults = await Promise.all(batchPromises);
		for (let offset = 0; offset < batchResults.length; offset += 1) {
			results[start + offset] = batchResults[offset]!;
		}
		await runBatch(end);
	};

	await runBatch(0);
	return results;
}

function isMediaTrack(track: InputTrack): boolean {
	return track.type === 'video' || track.type === 'audio' || track.type === 'subtitle';
}

function toMediaTracks(tracks: readonly InputTrack[]): InputTrack[] {
	const result: InputTrack[] = [];
	for (const track of tracks) {
		if (isMediaTrack(track)) result.push(track);
	}
	return result;
}

function splitFilterChain(value: string): string[] {
	return value
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
}

function parseScaleFilter(expr: string): { width: number; height: number; fit: 'fill' | 'contain' | 'cover' } | null {
	const match = expr.match(/^scale=([0-9]+):([0-9]+)/);
	if (!match) return null;
	const width = Number(match[1]);
	const height = Number(match[2]);
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
	const fit = expr.includes('force_original_aspect_ratio=decrease') ? 'contain' : 'fill';
	return { width, height, fit };
}

function parseEqFilter(expr: string): Pick<ParsedFilterSettings, 'brightness' | 'contrast' | 'saturation' | 'hue'> {
	if (!expr.startsWith('eq=')) return {};
	const body = expr.slice(3);
	const out: Pick<ParsedFilterSettings, 'brightness' | 'contrast' | 'saturation' | 'hue'> = {};
	for (const token of body.split(':')) {
		const [key, rawValue] = token.split('=');
		if (!key || !rawValue) continue;
		const value = Number(rawValue);
		if (!Number.isFinite(value)) continue;
		if (key === 'brightness') out.brightness = value;
		if (key === 'contrast') out.contrast = value;
		if (key === 'saturation') out.saturation = value;
		if (key === 'hue') out.hue = value;
	}
	return out;
}

function parseTrackMapToken(value: string): { wildcardType?: 'audio' | 'subtitle'; explicitTrackId?: number } {
	if (value === '0:a?') return { wildcardType: 'audio' };
	if (value === '0:s?') return { wildcardType: 'subtitle' };
	const explicitMatch = value.match(/^0:(\d+)$/);
	if (explicitMatch) {
		const trackId = Number(explicitMatch[1]);
		if (Number.isFinite(trackId)) return { explicitTrackId: trackId };
	}
	return {};
}

function toDispositionRecord(track: InputTrack): Record<string, number> {
	const disposition = track.disposition;
	return {
		default: disposition.default ? 1 : 0,
		forced: disposition.forced ? 1 : 0,
		original: disposition.original ? 1 : 0,
		commentary: disposition.commentary ? 1 : 0,
		hearing_impaired: disposition.hearingImpaired ? 1 : 0,
		visual_impaired: disposition.visuallyImpaired ? 1 : 0,
	};
}

function maybeTrackLanguage(track: InputTrack): string | undefined {
	const language = track.languageCode?.trim();
	if (!language || language.toLowerCase() === 'und') return undefined;
	return language;
}

function maybeTrackTitle(track: InputTrack): string | undefined {
	const title = track.name?.trim();
	return title || undefined;
}

function codecLabel(track: InputTrack): string {
	if (track.codec) return track.codec;
	if (typeof track.internalCodecId === 'string' && track.internalCodecId.trim()) return track.internalCodecId;
	if (typeof track.internalCodecId === 'number') return String(track.internalCodecId);
	return 'unknown';
}

function outputFormatForContainer(container: OutputContainer): Mp4OutputFormat | MkvOutputFormat | WebMOutputFormat {
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

function extractAttachedFiles(tags: MetadataTags): Array<{ key: string; file: AttachedFile }> {
	const result: Array<{ key: string; file: AttachedFile }> = [];
	const raw = tags.raw;
	if (!raw) return result;
	for (const [key, value] of Object.entries(raw)) {
		if (value instanceof AttachedFile) {
			result.push({ key, file: value });
		}
	}
	return result;
}

function isLikelyFontAttachment(name: string | undefined, mimeType: string | undefined): boolean {
	const lowerName = name?.toLowerCase() ?? '';
	const lowerMime = mimeType?.toLowerCase() ?? '';
	if (lowerMime.startsWith('font/')) return true;
	if (lowerMime === 'application/font-sfnt' || lowerMime === 'application/vnd.ms-opentype') return true;
	return /\.(ttf|otf|woff|woff2|ttc|otc|fon)$/i.test(lowerName);
}

function sanitizeFontName(name: string | undefined, fallback: string): string {
	const value = name?.trim();
	if (value) return value;
	return fallback;
}

function isMatroskaFile(file: File): boolean {
	const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
	return ext === 'mkv' || ext === 'webm' || ext === 'mka' || ext === 'mks';
}

function mkvTrackToProbeStream(track: MkvSubtitleTrack, index: number): ProbeStreamInfo {
	const codecMap: Record<string, string> = {
		'S_TEXT/ASS': 'ass',
		'S_TEXT/SSA': 'ssa',
		'S_TEXT/UTF8': 'subrip',
		'S_TEXT/WEBVTT': 'webvtt',
		'S_HDMV/PGS': 'hdmv_pgs_subtitle',
		'S_DVBSUB': 'dvb_subtitle',
		'S_VOBSUB': 'dvd_subtitle',
	};
	return {
		index: 1000 + index,
		type: 'subtitle',
		codec: codecMap[track.codecId] ?? track.codecId,
		language: track.language,
		title: track.name,
		isDefault: track.isDefault,
		isForced: track.isForced,
	};
}

async function canvasToPngBytes(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Uint8Array> {
	if (canvas instanceof OffscreenCanvas) {
		const blob = await canvas.convertToBlob({ type: 'image/png' });
		return new Uint8Array(await blob.arrayBuffer());
	}
	const blob = await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob((result) => {
			if (!result) {
				reject(new Error('Failed to encode PNG'));
				return;
			}
			resolve(result);
		}, 'image/png');
	});
	return new Uint8Array(await blob.arrayBuffer());
}

function parseTranscodeSettings(msg: TranscodeMessage): ParsedTranscodeSettings {
	const settings: ParsedTranscodeSettings = {
		container: parseOutputContainer(msg.outputName),
		videoForceTranscode: false,
		audioForceTranscode: false,
		filters: {},
		includeAllAudio: false,
		includeAllSubtitles: false,
		explicitTrackIds: new Set<number>(),
	};

	for (let i = 0; i < msg.args.length; i++) {
		const token = msg.args[i]!;
		const value = msg.args[i + 1];
		switch (token) {
			case '-ss': {
				const parsed = parseFiniteNumber(value);
				if (parsed != null && parsed >= 0) settings.trimStart = parsed;
				i += 1;
				break;
			}
			case '-t': {
				const parsed = parseFiniteNumber(value);
				if (parsed != null && parsed > 0) settings.trimDuration = parsed;
				i += 1;
				break;
			}
			case '-c:v': {
				if (value && value !== 'copy') {
					settings.videoForceTranscode = true;
					const codec = TRANSCODE_VIDEO_CODEC_MAP[value];
					if (codec) settings.videoCodec = codec;
				}
				i += 1;
				break;
			}
			case '-c:a': {
				if (value && value !== 'copy') {
					settings.audioForceTranscode = true;
					const codec = TRANSCODE_AUDIO_CODEC_MAP[value];
					if (codec) settings.audioCodec = codec;
				}
				i += 1;
				break;
			}
			case '-b:v': {
				const bitrate = parseBitrateToBps(value);
				if (bitrate != null && bitrate > 0) {
					settings.videoBitrate = bitrate;
					settings.videoForceTranscode = true;
				}
				i += 1;
				break;
			}
			case '-b:a': {
				const bitrate = parseBitrateToBps(value);
				if (bitrate != null && bitrate > 0) {
					settings.audioBitrate = bitrate;
					settings.audioForceTranscode = true;
				}
				i += 1;
				break;
			}
			case '-map': {
				if (value) {
					const map = parseTrackMapToken(value);
					if (map.wildcardType === 'audio') settings.includeAllAudio = true;
					if (map.wildcardType === 'subtitle') settings.includeAllSubtitles = true;
					if (map.explicitTrackId != null) settings.explicitTrackIds.add(map.explicitTrackId);
				}
				i += 1;
				break;
			}
			case '-vf': {
				if (!value) {
					i += 1;
					break;
				}
				for (const expr of splitFilterChain(value)) {
					const scale = parseScaleFilter(expr);
					if (scale) {
						settings.filters.resize = scale;
						continue;
					}
					if (expr.startsWith('eq=')) {
						Object.assign(settings.filters, parseEqFilter(expr));
					}
				}
				i += 1;
				break;
			}
		}
	}

	if (settings.filters.resize) settings.videoForceTranscode = true;
	if (
		settings.filters.brightness != null ||
		settings.filters.contrast != null ||
		settings.filters.saturation != null ||
		settings.filters.hue != null
	) {
		settings.videoForceTranscode = true;
	}

	return settings;
}

function buildVideoProcess(filters: ParsedFilterSettings): ConversionVideoOptions['process'] | undefined {
	const brightness = filters.brightness ?? 0;
	const contrast = filters.contrast ?? 1;
	const saturation = filters.saturation ?? 1;
	const hue = filters.hue ?? 0;
	const hasCustomFilter =
		Math.abs(brightness) > 1e-4 ||
		Math.abs(contrast - 1) > 1e-4 ||
		Math.abs(saturation - 1) > 1e-4 ||
		Math.abs(hue) > 1e-4;
	if (!hasCustomFilter) return undefined;

	let canvas: OffscreenCanvas | null = null;
	let ctx: OffscreenCanvasRenderingContext2D | null = null;

	return (sample) => {
		const width = Math.max(1, Math.round((sample as { displayWidth?: number }).displayWidth ?? 1));
		const height = Math.max(1, Math.round((sample as { displayHeight?: number }).displayHeight ?? 1));
		if (!canvas || canvas.width !== width || canvas.height !== height) {
			canvas = new OffscreenCanvas(width, height);
			ctx = canvas.getContext('2d', { alpha: true });
		}
		if (!ctx || !canvas) return sample;

		const brightnessPct = clamp((1 + brightness) * 100, 0, 400);
		const contrastPct = clamp(contrast * 100, 0, 400);
		const saturationPct = clamp(saturation * 100, 0, 400);
		ctx.save();
		ctx.clearRect(0, 0, width, height);
		ctx.filter = `brightness(${brightnessPct}%) contrast(${contrastPct}%) saturate(${saturationPct}%) hue-rotate(${hue}deg)`;
		(sample as { draw: (context: OffscreenCanvasRenderingContext2D, x: number, y: number) => void }).draw(
			ctx,
			0,
			0,
		);
		ctx.restore();
		return canvas;
	};
}

function makeProbeStreamInfo(track: InputTrack): ProbeStreamInfo {
	const base: ProbeStreamInfo = {
		index: track.id,
		type: track.type,
		codec: codecLabel(track),
		language: maybeTrackLanguage(track),
		title: maybeTrackTitle(track),
		isDefault: track.disposition.default,
		isForced: track.disposition.forced,
		disposition: toDispositionRecord(track),
	};

	if (track.isVideoTrack()) {
		base.width = track.displayWidth;
		base.height = track.displayHeight;
	}
	if (track.isAudioTrack()) {
		base.sampleRate = track.sampleRate;
		base.channels = track.numberOfChannels;
	}

	return base;
}

async function computeQuickTrackStats(track: InputTrack): Promise<{ fps?: number; bitrate?: number }> {
	try {
		const stats = await track.computePacketStats(80);
		const output: { fps?: number; bitrate?: number } = {};
		if (track.type === 'video' && Number.isFinite(stats.averagePacketRate)) {
			output.fps = Number(stats.averagePacketRate.toFixed(3));
		}
		if (Number.isFinite(stats.averageBitrate) && stats.averageBitrate > 0) {
			output.bitrate = Math.round(stats.averageBitrate / 1000);
		}
		return output;
	} catch {
		return {};
	}
}

function toFpsFraction(fps: number | undefined): string | undefined {
	if (!fps || !Number.isFinite(fps) || fps <= 0) return undefined;
	const scaled = Math.round(fps * 1000);
	if (!Number.isFinite(scaled) || scaled <= 0) return undefined;
	return `${scaled}/1000`;
}

function parseAttachmentSelection(attachments: FontAttachmentInfo[]): Set<string> {
	const names = new Set<string>();
	for (const attachment of attachments) {
		const key = attachment.filename.trim().toLowerCase();
		if (key) names.add(key);
	}
	return names;
}

function splitSelectedTrackIdsByType(
	tracks: readonly InputTrack[],
	explicitTrackIds: ReadonlySet<number>,
): { selectedAudioTrackIds: Set<number>; selectedSubtitleTrackIds: Set<number> } {
	const selectedAudioTrackIds = new Set<number>();
	const selectedSubtitleTrackIds = new Set<number>();
	if (explicitTrackIds.size === 0) return { selectedAudioTrackIds, selectedSubtitleTrackIds };

	for (const track of tracks) {
		if (!explicitTrackIds.has(track.id)) continue;
		if (track.type === 'audio') selectedAudioTrackIds.add(track.id);
		if (track.type === 'subtitle') selectedSubtitleTrackIds.add(track.id);
	}

	return { selectedAudioTrackIds, selectedSubtitleTrackIds };
}

async function handleProbe(msg: ProbeMessage): Promise<void> {
	post({ type: 'PROBE_STATUS', status: 'Reading stream metadata...' });

	const input = new Input({ source: new BlobSource(msg.file), formats: ALL_FORMATS });
	try {
		const [format, duration, tracks, tags] = await Promise.all([
			input.getFormat(),
			input.computeDuration(),
			input.getTracks(),
			input.getMetadataTags(),
		]);

		const mediaTracks = toMediaTracks(tracks);
		const streamEntries = await mapInBatches(
			mediaTracks,
			async (track) => {
				const stream = makeProbeStreamInfo(track);
				const stats = await computeQuickTrackStats(track);
				if (stats.fps != null) stream.fps = stats.fps;
				if (stats.bitrate != null) stream.bitrate = stats.bitrate;
				return stream;
			},
			4,
		);

		const fontAttachments: FontAttachmentInfo[] = [];
		const fonts: Array<{ name: string; data: Uint8Array }> = [];
		for (const [index, attachment] of extractAttachedFiles(tags).entries()) {
			const filename = sanitizeFontName(attachment.file.name, `attachment-${index + 1}`);
			if (!isLikelyFontAttachment(filename, attachment.file.mimeType)) continue;
			fontAttachments.push({ index, filename });
			fonts.push({ name: filename, data: new Uint8Array(attachment.file.data) });
		}

		let allStreams = streamEntries;
		if (isMatroskaFile(msg.file) && !streamEntries.some((s) => s.type === 'subtitle')) {
			try {
				const mkvResult = await parseMkvSubtitles(msg.file, { tracksOnly: true });
				if (mkvResult.tracks.length > 0) {
					const subtitleStreams = mkvResult.tracks.map((t, i) => mkvTrackToProbeStream(t, i));
					allStreams = [...streamEntries, ...subtitleStreams];
				}
			} catch {
				// MKV subtitle parse failed — continue without subtitles
			}
		}

		const result: ProbeResultData = {
			duration: Number.isFinite(duration) ? duration : 0,
			bitrate:
				Number.isFinite(duration) && duration > 0
					? Math.max(0, Math.round((msg.file.size * 8) / duration / 1000))
					: 0,
			format: (format.name || msg.file.type || '').toLowerCase(),
			streams: allStreams,
			fontAttachments,
		};

		post({ type: 'PROBE_STATUS', status: '' });
		post({ type: 'PROBE_RESULT', result, fonts });
	} finally {
		input.dispose();
	}
}

async function handleProbeDetails(msg: ProbeDetailsMessage): Promise<void> {
	const input = new Input({ source: new BlobSource(msg.file), formats: ALL_FORMATS });
	try {
		const [format, duration, tracks, tags, mimeType] = await Promise.all([
			input.getFormat(),
			input.computeDuration(),
			input.getTracks(),
			input.getMetadataTags(),
			input.getMimeType(),
		]);

		const mediaTracks = toMediaTracks(tracks);
		const streams = await mapInBatches(
			mediaTracks,
			async (track) => {
				const [packetStats, trackDuration, startTime] = await Promise.all([
					track.computePacketStats().catch(() => null),
					track.computeDuration().catch(() => undefined),
					track.getFirstTimestamp().catch(() => undefined),
				]);
				const fps =
					track.type === 'video' && packetStats && Number.isFinite(packetStats.averagePacketRate)
						? packetStats.averagePacketRate
						: undefined;
				const bitrateBps =
					packetStats && Number.isFinite(packetStats.averageBitrate) && packetStats.averageBitrate > 0
						? packetStats.averageBitrate
						: undefined;

				const language = maybeTrackLanguage(track);
				const title = maybeTrackTitle(track);
				const detail: DetailedProbeStreamInfo = {
					index: track.id,
					codec_type: track.type,
					codec_name: codecLabel(track),
					codec_long_name: codecLabel(track),
					codec_tag_string:
						typeof track.internalCodecId === 'string' && track.internalCodecId.trim()
							? track.internalCodecId
							: undefined,
					avg_frame_rate: toFpsFraction(fps),
					r_frame_rate: toFpsFraction(fps),
					bit_rate: bitrateBps != null ? String(Math.round(bitrateBps)) : undefined,
					duration:
						trackDuration != null && Number.isFinite(trackDuration) ? String(trackDuration) : undefined,
					start_time: startTime != null && Number.isFinite(startTime) ? String(startTime) : undefined,
					disposition: toDispositionRecord(track),
					tags: { ...(language ? { language } : {}), ...(title ? { title } : {}) },
				};

				if (track.isVideoTrack()) {
					detail.width = track.displayWidth;
					detail.height = track.displayHeight;
					detail.display_aspect_ratio = `${track.displayWidth}:${track.displayHeight}`;
					detail.sample_aspect_ratio = '1:1';
				}

				if (track.isAudioTrack()) {
					detail.sample_rate = String(track.sampleRate);
					detail.channels = track.numberOfChannels;
					detail.channel_layout =
						track.numberOfChannels === 1
							? 'mono'
							: track.numberOfChannels === 2
								? 'stereo'
								: `${track.numberOfChannels} channels`;
				}

				return detail;
			},
			4,
		);

		if (isMatroskaFile(msg.file) && !streams.some((s) => s.codec_type === 'subtitle')) {
			try {
				const mkvResult = await parseMkvSubtitles(msg.file, { tracksOnly: true });
				for (const [i, track] of mkvResult.tracks.entries()) {
					streams.push({
						index: 1000 + i,
						codec_type: 'subtitle',
						codec_name: track.codecId,
						codec_long_name: track.codecId,
						disposition: {
							default: track.isDefault ? 1 : 0,
							forced: track.isForced ? 1 : 0,
							original: 0,
							commentary: 0,
							hearing_impaired: 0,
							visual_impaired: 0,
						},
						tags: {
							...(track.language ? { language: track.language } : {}),
							...(track.name ? { title: track.name } : {}),
						},
					});
				}
			} catch {
				// MKV subtitle parse failed
			}
		}

		for (const [index, attachment] of extractAttachedFiles(tags).entries()) {
			const filename = sanitizeFontName(attachment.file.name, `attachment-${index + 1}`);
			streams.push({
				index: 10_000 + index,
				codec_type: 'attachment',
				codec_name: attachment.file.mimeType ?? 'application/octet-stream',
				codec_long_name: attachment.file.mimeType ?? 'Attachment',
				bit_rate: String(attachment.file.data.byteLength * 8),
				disposition: {
					default: 0,
					forced: 0,
					original: 0,
					commentary: 0,
					hearing_impaired: 0,
					visual_impaired: 0,
				},
				tags: { title: filename, mimetype: attachment.file.mimeType ?? 'application/octet-stream' },
			});
		}

		const result: DetailedProbeResultData = {
			format: {
				duration: Number.isFinite(duration) ? String(duration) : undefined,
				bit_rate:
					Number.isFinite(duration) && duration > 0
						? String(Math.round((msg.file.size * 8) / duration))
						: undefined,
				format_name: format.name.toLowerCase(),
				format_long_name: format.name,
				size: String(msg.file.size),
				probe_score: 100,
				tags: {
					...(tags.title ? { title: tags.title } : {}),
					...(tags.artist ? { artist: tags.artist } : {}),
					...(mimeType ? { mime_type: mimeType } : {}),
				},
			},
			streams,
			chapters: [],
		};

		post({ type: 'PROBE_DETAILS_RESULT', result });
	} finally {
		input.dispose();
	}
}

async function handleExtractFonts(msg: ExtractFontsMessage): Promise<void> {
	const input = new Input({ source: new BlobSource(msg.file), formats: ALL_FORMATS });
	try {
		const tags = await input.getMetadataTags();
		const selectedNames = parseAttachmentSelection(msg.attachments);
		const fonts: Array<{ name: string; data: Uint8Array }> = [];

		for (const [index, attachment] of extractAttachedFiles(tags).entries()) {
			const name = sanitizeFontName(attachment.file.name, `attachment-${index + 1}`);
			if (!isLikelyFontAttachment(name, attachment.file.mimeType)) continue;
			if (selectedNames.size > 0 && !selectedNames.has(name.toLowerCase())) continue;
			fonts.push({ name, data: new Uint8Array(attachment.file.data) });
		}

		post({ type: 'FONTS_RESULT', fonts });
	} finally {
		input.dispose();
	}
}

async function handleScreenshot(msg: ScreenshotMessage): Promise<void> {
	post({ type: 'STARTED', job: 'screenshot' });
	const input = new Input({ source: new BlobSource(msg.file), formats: ALL_FORMATS });
	try {
		const videoTrack = await input.getPrimaryVideoTrack();
		if (!videoTrack) throw new Error('No video track found');

		const sink = new CanvasSink(videoTrack, { poolSize: 1 });
		const firstTimestamp = await videoTrack.getFirstTimestamp();
		const wrapped = (await sink.getCanvas(msg.timestamp)) ?? (await sink.getCanvas(firstTimestamp));
		if (!wrapped) throw new Error('No frame available at requested timestamp');

		const bytes = await canvasToPngBytes(wrapped.canvas);
		sendBytesDone('DONE', bytes, 'screenshot.png');
	} finally {
		input.dispose();
	}
}

async function handleGif(msg: GifMessage): Promise<void> {
	post({ type: 'STARTED', job: 'gif' });

	const input = new Input({ source: new BlobSource(msg.file), formats: ALL_FORMATS });
	try {
		const videoTrack = await input.getPrimaryVideoTrack();
		if (!videoTrack) throw new Error('No video track found');

		const trackStart = await videoTrack.getFirstTimestamp();
		const trackDuration = await videoTrack.computeDuration();
		const clipStart = clamp(msg.startTime ?? trackStart, trackStart, Math.max(trackStart, trackDuration));
		const clipDuration = Math.max(0.1, msg.duration ?? Math.max(0.1, trackDuration - clipStart));
		const speed = clamp(msg.speed ?? 1, 0.1, 8);
		const fps = clamp(Math.round(msg.fps), 1, 60);
		const outputFrameCount = Math.max(1, Math.min(600, Math.round((clipDuration / speed) * fps)));
		const sourceStep = speed / fps;

		const height =
			msg.height ?? Math.max(1, Math.round((msg.width / videoTrack.displayWidth) * videoTrack.displayHeight));
		const sink = new CanvasSink(videoTrack, {
			width: Math.max(1, msg.width),
			height: Math.max(1, height),
			fit: 'contain',
			poolSize: 1,
		});

		const frameCanvas = new OffscreenCanvas(Math.max(1, msg.width), Math.max(1, height));
		const frameCtx = frameCanvas.getContext('2d', { alpha: true });
		if (!frameCtx) throw new Error('Failed to create frame context');

		const frameIndices = Array.from({ length: outputFrameCount }, (_, index) => index);
		const wrappedFrames = await mapInBatches(
			frameIndices,
			async (i) => {
				const offset = i * sourceStep;
				const sourceTime = msg.reverse ? clipStart + Math.max(clipDuration - offset, 0) : clipStart + offset;
				const wrapped = await sink.getCanvas(sourceTime);
				return { i, wrapped };
			},
			1,
		);

		const frames: Uint8Array[] = [];
		for (const { i, wrapped } of wrappedFrames) {
			if (!wrapped) continue;
			frameCtx.clearRect(0, 0, frameCanvas.width, frameCanvas.height);
			frameCtx.drawImage(wrapped.canvas, 0, 0, frameCanvas.width, frameCanvas.height);
			frames.push(new Uint8Array(frameCtx.getImageData(0, 0, frameCanvas.width, frameCanvas.height).data));
			const progress = Math.min(0.85, ((i + 1) / outputFrameCount) * 0.85);
			post({ type: 'PROGRESS', progress, time: i / fps, fps, frame: i + 1, speed });
		}

		if (frames.length === 0) throw new Error('No frames extracted for GIF');

		const blob = await encodeGif({
			frames,
			width: frameCanvas.width,
			height: frameCanvas.height,
			fps,
			maxColors: clamp(msg.maxColors ?? 256, 2, 256),
			speed: 10,
			onProgress: (progress) => {
				post({
					type: 'PROGRESS',
					progress: 0.85 + progress * 0.15,
					time: clipDuration,
					fps,
					frame: frames.length,
					speed,
				});
			},
		});

		const bytes = new Uint8Array(await blob.arrayBuffer());
		sendBytesDone('DONE', bytes, 'output.gif');
	} finally {
		input.dispose();
	}
}

async function handleTranscode(msg: TranscodeMessage): Promise<void> {
	post({ type: 'STARTED', job: 'transcode' });
	const parsed = parseTranscodeSettings(msg);

	const input = new Input({ source: new BlobSource(msg.file), formats: ALL_FORMATS });
	try {
		const output = new Output({ format: outputFormatForContainer(parsed.container), target: new BufferTarget() });

		const tracks = await input.getTracks();
		const { selectedAudioTrackIds, selectedSubtitleTrackIds } = splitSelectedTrackIdsByType(
			tracks,
			parsed.explicitTrackIds,
		);

		const includeAnyAudio = parsed.includeAllAudio || selectedAudioTrackIds.size > 0;
		const includeAnySubtitle = parsed.includeAllSubtitles || selectedSubtitleTrackIds.size > 0;
		if (!includeAnySubtitle) {
			post({
				type: 'LOG',
				message:
					'[mediabunny] Subtitle deselection requested, but track-level subtitle discard is not currently exposed by Conversion API.',
			});
		}

		const videoProcess = buildVideoProcess(parsed.filters);
		const trimStart = parsed.trimStart;
		const trimEnd =
			parsed.trimDuration != null && parsed.trimDuration > 0
				? (parsed.trimStart ?? 0) + parsed.trimDuration
				: undefined;

		const conversion = await Conversion.init({
			input,
			output,
			trim: trimStart != null || trimEnd != null ? { start: trimStart, end: trimEnd } : undefined,
			video: (track) => {
				const options: ConversionVideoOptions = {};
				if (track.number > 1) {
					options.discard = true;
					return options;
				}
				if (parsed.filters.resize) {
					options.width = parsed.filters.resize.width;
					options.height = parsed.filters.resize.height;
					options.fit = parsed.filters.resize.fit;
				}
				if (parsed.videoCodec) options.codec = parsed.videoCodec;
				if (parsed.videoBitrate != null && parsed.videoBitrate > 0) options.bitrate = parsed.videoBitrate;
				if (parsed.videoForceTranscode) options.forceTranscode = true;
				if (videoProcess) options.process = videoProcess;
				return options;
			},
			audio: (track) => {
				const options: ConversionAudioOptions = {};
				if (!includeAnyAudio) {
					options.discard = true;
					return options;
				}
				if (!parsed.includeAllAudio && selectedAudioTrackIds.size > 0 && !selectedAudioTrackIds.has(track.id)) {
					options.discard = true;
					return options;
				}
				if (parsed.audioCodec) options.codec = parsed.audioCodec;
				if (parsed.audioBitrate != null && parsed.audioBitrate > 0) options.bitrate = parsed.audioBitrate;
				if (parsed.audioForceTranscode) options.forceTranscode = true;
				return options;
			},
		});

		conversion.onProgress = (progress) => {
			const expectedDuration = msg.expectedDurationSec ?? 0;
			const time = expectedDuration > 0 ? expectedDuration * progress : 0;
			post({ type: 'PROGRESS', progress, time, fps: 0, frame: Math.round(progress * 1000), speed: 1 });
		};

		if (!conversion.isValid) {
			throw new Error(
				`Invalid conversion settings: ${conversion.discardedTracks
					.map((entry) => `${entry.track.type}:${entry.reason}`)
					.join(', ')}`,
			);
		}

		await conversion.execute();
		const buffer = output.target.buffer;
		if (!buffer) throw new Error('Conversion produced no output buffer');
		sendBytesDone('DONE', new Uint8Array(buffer), msg.outputName);
	} finally {
		input.dispose();
	}
}

// ── Subtitle Extraction ──

function formatAssTimestamp(seconds: number): string {
	const totalCs = Math.max(0, Math.round(seconds * 100));
	const h = Math.floor(totalCs / 360_000);
	const m = Math.floor((totalCs % 360_000) / 6_000);
	const s = Math.floor((totalCs % 6_000) / 100);
	const cs = totalCs % 100;
	return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function formatVttTimestamp(seconds: number): string {
	const totalMs = Math.max(0, Math.round(seconds * 1000));
	const h = Math.floor(totalMs / 3_600_000);
	const m = Math.floor((totalMs % 3_600_000) / 60_000);
	const s = Math.floor((totalMs % 60_000) / 1000);
	const ms = totalMs % 1000;
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function stripAssOverrideTags(text: string): string {
	return text
		.replaceAll(/\{[^}]*\}/g, '')
		.replaceAll('\\N', '\n')
		.replaceAll('\\n', '\n')
		.trim();
}

function isAssCodec(codecId: string | number | Uint8Array | null): boolean {
	if (typeof codecId !== 'string') return false;
	const lower = codecId.toLowerCase();
	return lower === 's_text/ass' || lower === 's_text/ssa' || lower === 'ass' || lower === 'ssa';
}

interface SubtitleCueData {
	start: number;
	end: number;
	text: string;
	assLine?: string;
}

function parseAssPacketData(data: string, timestamp: number, duration: number): SubtitleCueData | null {
	const parts = data.split(',');
	if (parts.length < 9) return null;
	const layer = parts[1]?.trim() ?? '0';
	const style = parts[2]?.trim() ?? 'Default';
	const name = parts[3]?.trim() ?? '';
	const marginL = parts[4]?.trim() ?? '0';
	const marginR = parts[5]?.trim() ?? '0';
	const marginV = parts[6]?.trim() ?? '0';
	const effect = parts[7]?.trim() ?? '';
	const text = parts.slice(8).join(',');
	const plainText = stripAssOverrideTags(text);
	if (!plainText) return null;
	const start = timestamp;
	const end = timestamp + duration;
	const assLine = `Dialogue: ${layer},${formatAssTimestamp(start)},${formatAssTimestamp(end)},${style},${name},${marginL},${marginR},${marginV},${effect},${text}`;
	return { start, end, text: plainText, assLine };
}

function parseSrtPacketData(data: string, timestamp: number, duration: number): SubtitleCueData | null {
	const text = data.trim();
	if (!text) return null;
	return { start: timestamp, end: timestamp + duration, text };
}

function buildMinimalAssFile(dialogueLines: string[]): string {
	const lines = [
		'[Script Info]',
		'ScriptType: v4.00+',
		'PlayResX: 1920',
		'PlayResY: 1080',
		'WrapStyle: 0',
		'',
		'[V4+ Styles]',
		'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
		'Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,20,20,40,1',
		'',
		'[Events]',
		'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
		...dialogueLines,
	];
	return lines.join('\n');
}

function buildWebVtt(cues: SubtitleCueData[]): string {
	if (cues.length === 0) return '';
	const lines = ['WEBVTT', ''];
	for (const cue of cues) {
		lines.push(`${formatVttTimestamp(cue.start)} --> ${formatVttTimestamp(cue.end)}`);
		lines.push(cue.text);
		lines.push('');
	}
	return lines.join('\n');
}

async function handleSubtitlePreview(msg: SubtitlePreviewMessage): Promise<void> {
	const mkvResult = await parseMkvSubtitles(msg.file, { tracksOnly: true });
	if (mkvResult.tracks.length === 0) throw new Error('No subtitle tracks found in file');

	// The streamIndex from probe maps to the subtitle track list position (index among subtitle streams)
	// For MKV subtitle tracks with index >= 1000, the position = streamIndex - 1000
	const trackPosition = msg.streamIndex >= 1000 ? msg.streamIndex - 1000 : msg.streamIndex;
	const targetTrack = mkvResult.tracks[trackPosition];
	if (!targetTrack) throw new Error(`Subtitle track at position ${trackPosition} not found`);

	const isAss = isAssCodec(targetTrack.codecId) || msg.subtitleCodec === 'ass' || msg.subtitleCodec === 'ssa';

	const fullResult = await parseMkvSubtitles(msg.file, { targetTrackNumber: targetTrack.trackNumber });
	const rawCues = fullResult.cues.filter((c) => c.trackNumber === targetTrack.trackNumber);

	if (isAss) {
		// Build a full ASS file: use CodecPrivate as the header (it contains styles), append dialogue lines
		const cues: SubtitleCueData[] = [];
		for (const raw of rawCues) {
			const cue = parseAssPacketData(raw.data, raw.start, raw.end - raw.start);
			if (cue) cues.push(cue);
		}
		cues.sort((a, b) => a.start - b.start);

		let assContent: string;
		if (targetTrack.codecPrivate) {
			// CodecPrivate contains the full ASS header (Script Info, Styles, etc.)
			// We just need to append the Events section with Dialogue lines
			const header = targetTrack.codecPrivate.trimEnd();
			const dialogueLines = cues.map((c) => c.assLine!).filter(Boolean);
			const hasEventsSection = header.includes('[Events]');
			if (hasEventsSection) {
				assContent = header + '\n' + dialogueLines.join('\n') + '\n';
			} else {
				assContent =
					header +
					'\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n' +
					dialogueLines.join('\n') +
					'\n';
			}
		} else {
			assContent = buildMinimalAssFile(cues.map((c) => c.assLine!).filter(Boolean));
		}

		if (!assContent) throw new Error('Failed to build ASS content from subtitle track');
		post({ type: 'SUBTITLE_PREVIEW_RESULT', requestId: msg.requestId, format: 'ass', content: assContent });
		return;
	}

	// SRT/text subtitles → build WebVTT
	const cues: SubtitleCueData[] = [];
	for (const raw of rawCues) {
		const cue = parseSrtPacketData(raw.data, raw.start, raw.end - raw.start);
		if (cue) cues.push(cue);
	}
	cues.sort((a, b) => a.start - b.start);

	const vttContent = buildWebVtt(cues);
	if (!vttContent) throw new Error('No subtitle cues found in track');
	post({ type: 'SUBTITLE_PREVIEW_RESULT', requestId: msg.requestId, format: 'webvtt', content: vttContent });
}

// ── Message Router ──

post({ type: 'READY' });

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
	try {
		switch (e.data.type) {
			case 'TRANSCODE':
				await handleTranscode(e.data);
				break;
			case 'GIF':
				await handleGif(e.data);
				break;
			case 'SCREENSHOT':
				await handleScreenshot(e.data);
				break;
			case 'PROBE':
				await handleProbe(e.data);
				break;
			case 'PROBE_DETAILS':
				await handleProbeDetails(e.data);
				break;
			case 'SUBTITLE_PREVIEW':
				await handleSubtitlePreview(e.data);
				break;
			case 'EXTRACT_FONTS':
				await handleExtractFonts(e.data);
				break;
		}
	} catch (err) {
		const error = err instanceof Error ? err.message : String(err);
		post({ type: 'ERROR', error });
	}
};
