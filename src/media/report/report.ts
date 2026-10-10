/**
 * Everything worth knowing about a video or audio file, as a release's NFO lists it: each video,
 * audio and subtitle track with its codec details, colours and HDR, chapters and attachments.
 * Read once per file, when the information panel asks.
 */
import {
	ALL_FORMATS,
	BlobSource,
	EncodedPacketSink,
	type EncodedPacket,
	Input,
	type InputAudioTrack,
	Mp4InputFormat,
	QuickTimeInputFormat,
	type InputTrack,
	type InputVideoTrack,
} from 'mediabunny';
import { audioBitrate } from '../audio-tracks';
import type { AttachmentInfo } from '../subtitle-source';
import { NO_STREAM_HDR, readAvcc, readHvcc, readPacketHdr, type CodedFormat, type StreamHdr } from './bitstream';
import type { ContentLight, MasteringDisplay } from './bitstream';
import { aacProfile, dtsExtension, eac3Atmos, flacDepth, pcmDepth, trueHdAtmos, videoProfile } from './codec-details';
import { type Chapter, type ContainerFacts, type DolbyVision, readContainerFacts, type TrackFacts } from './container';

export type { Chapter, ContentLight, DolbyVision, MasteringDisplay };

/** How a track is meant to be used, as the file marks it. */
export interface TrackFlags {
	default: boolean;
	forced: boolean;
	commentary: boolean;
	hearingImpaired: boolean;
	/** Audio description, or subtitles describing the sound for the visually impaired. */
	described: boolean;
}

export interface TrackBase extends TrackFlags {
	id: number;
	/** ISO 639-2 or BCP 47, `und` when unknown. */
	language: string;
	name: string | null;
	/** Seconds, from the file's statistics or its last packet; null when unknown. */
	duration: number | null;
}

/** The kinds of HDR a video carries, from the richest: what the panel names. */
export type HdrFormat = 'dolby-vision' | 'hdr10-plus' | 'hdr10' | 'pq' | 'hlg';

export interface VideoReport extends TrackBase {
	codec: string | null;
	codecString: string | null;
	profile: string | null;
	level: string | null;
	tier: string | null;
	/** Size stored, in pixels. */
	width: number;
	height: number;
	/** Size shown once pixels are made square, before turning. */
	displayWidth: number;
	displayHeight: number;
	/** Pixel shape when not square, `[w, h]`. */
	pixelAspect: [number, number] | null;
	rotation: number;
	bitDepth: number | null;
	chroma: string | null;
	fullRange: boolean | null;
	primaries: string | null;
	transfer: string | null;
	matrix: string | null;
	hdr: HdrFormat[];
	dolbyVision: DolbyVision | null;
	mastering: MasteringDisplay | null;
	light: ContentLight | null;
	/** Bits per second, as the file says it or counted; null when unknown. */
	bitrate: number | null;
	/** True when the bitrate is the file's size less its sound, the file saying nothing of it. */
	bitrateEstimated: boolean;
}

export interface AudioReport extends TrackBase {
	codec: string | null;
	/** What the codec name alone doesn't say: `LC`, `HE-AAC`, `MA`, `Atmos`. */
	profile: string | null;
	channels: number;
	sampleRate: number;
	bitDepth: number | null;
	bitrate: number | null;
	bitrateMode: 'constant' | 'variable' | null;
}

export interface SubtitleReport extends TrackBase {
	/** Matroska codec ID or MP4 sample entry. */
	codec: string;
}

export interface MediaReport {
	video: VideoReport[];
	audio: AudioReport[];
	subtitles: SubtitleReport[];
	attachments: AttachmentInfo[];
	chapters: Chapter[];
	muxingApp: string | null;
	writingApp: string | null;
	created: Date | null;
}

/** Pictures read for the metadata they carry: HDR10+ and Dolby Vision mark every one of them. */
const PACKETS_READ = 6;

async function packets(track: InputVideoTrack | InputAudioTrack, count: number): Promise<EncodedPacket[]> {
	const read: EncodedPacket[] = [];
	for await (const packet of new EncodedPacketSink(track).packets()) {
		read.push(packet);
		if (read.length >= count) break;
	}
	return read;
}

/** Where the file says too little, how many packets are read to measure a track. */
const PACKETS_SAMPLED = 48;

/** A track's names, flags and length; Matroska's own flags and statistics win over Mediabunny's. */
async function flags(track: InputTrack, extra: TrackFacts | undefined): Promise<TrackBase> {
	const [language, name, disposition] = await Promise.all([
		track.getLanguageCode(),
		track.getName(),
		track.getDisposition(),
	]);
	const duration = extra?.duration ?? (await track.computeDuration().catch(() => null));
	return {
		id: track.id,
		language,
		name: name?.trim() || null,
		default: disposition.default,
		forced: disposition.forced,
		commentary: disposition.commentary,
		hearingImpaired: disposition.hearingImpaired || (extra?.hearingImpaired ?? false),
		described: disposition.visuallyImpaired || (extra?.described ?? false),
		duration: duration && duration > 0 ? duration : null,
	};
}

/** The average bitrate counted from the packets, when that is cheap: MP4 keeps their sizes in its index. */
async function countedBitrate(track: InputTrack, indexed: boolean): Promise<number | null> {
	if (!indexed) return null;
	const stats = await track.computePacketStats().catch(() => null);
	return stats && stats.averageBitrate > 0 ? stats.averageBitrate : null;
}

/** Whether sound is coded at a constant bitrate: known for most codecs, measured for AAC and MP3. */
async function bitrateMode(
	track: InputAudioTrack,
	codec: string | null,
	profile: string | null,
): Promise<AudioReport['bitrateMode']> {
	if (!codec) return null;
	if (codec.startsWith('pcm') || codec === 'ac3' || codec === 'eac3') return 'constant';
	if (codec === 'dts') return profile ? 'variable' : 'constant';
	if (codec !== 'aac' && codec !== 'mp3') return 'variable';
	const sizes: number[] = [];
	for await (const packet of new EncodedPacketSink(track).packets(undefined, undefined, { metadataOnly: true })) {
		sizes.push(packet.byteLength);
		if (sizes.length >= PACKETS_SAMPLED) break;
	}
	if (sizes.length < 2) return null;
	// MP3 frames of a constant bitrate differ by a padding byte.
	const spread = Math.max(...sizes) - Math.min(...sizes);
	return spread <= (codec === 'mp3' ? 1 : 0) ? 'constant' : 'variable';
}

const asBytes = (description: AllowSharedBufferSource | undefined): Uint8Array | undefined =>
	description === undefined
		? undefined
		: description instanceof ArrayBuffer || description instanceof SharedArrayBuffer
			? new Uint8Array(description)
			: new Uint8Array(description.buffer, description.byteOffset, description.byteLength);

/** The HDR kinds, from what the container and the pictures say and the transfer used. */
function hdrFormats(transfer: string | null, container: ContainerFacts, stream: StreamHdr): HdrFormat[] {
	const formats: HdrFormat[] = [];
	if (container.dolbyVision || stream.dolbyVisionRpu) formats.push('dolby-vision');
	if (stream.hdr10Plus) formats.push('hdr10-plus');
	// PQ with the static metadata is HDR10; without it, still PQ (Dolby Vision profile 5 for one).
	const compatibility = container.dolbyVision?.compatibility;
	const dolbyOnly = container.dolbyVision !== null && (compatibility === 0 || compatibility === 2);
	// HDR10+ is HDR10 with dynamic metadata over it: named once, as the richer.
	if (transfer === 'pq' && !dolbyOnly && !stream.hdr10Plus)
		formats.push(container.mastering || stream.mastering ? 'hdr10' : 'pq');
	if (transfer === 'hlg') formats.push('hlg');
	return formats;
}

async function describeVideo(
	track: InputVideoTrack,
	container: ContainerFacts,
	indexed: boolean,
): Promise<VideoReport> {
	const extra = container.tracks.get(track.id);
	const [
		base,
		codec,
		codecString,
		width,
		height,
		displayWidth,
		displayHeight,
		aspect,
		rotation,
		colour,
		config,
		bitrate,
		average,
	] = await Promise.all([
		flags(track, extra),
		track.getCodec(),
		track.getCodecParameterString(),
		track.getCodedWidth(),
		track.getCodedHeight(),
		track.getSquarePixelWidth(),
		track.getSquarePixelHeight(),
		track.getPixelAspectRatio(),
		track.getRotation(),
		track.getColorSpace(),
		track.getDecoderConfig(),
		track.getBitrate(),
		track.getAverageBitrate(),
	]);
	const profile = videoProfile(codecString);
	const stream: StreamHdr = { ...NO_STREAM_HDR };
	const description = asBytes(config?.description);
	let coded: CodedFormat | null = null;
	if (description && codec === 'hevc') coded = readHvcc(description, stream);
	else if (description && codec === 'avc') coded = readAvcc(description);
	if (codec === 'hevc' || codec === 'avc' || codec === 'av1') {
		for (const packet of await packets(track, PACKETS_READ).catch(() => [])) {
			readPacketHdr(packet.data, codec, stream, coded?.lengthSize);
		}
	}
	const transfer = colour.transfer ?? null;
	return {
		...base,
		codec,
		codecString,
		profile: profile.profile,
		level: profile.level,
		tier: profile.tier,
		width,
		height,
		displayWidth,
		displayHeight,
		pixelAspect: aspect.num !== aspect.den ? [aspect.num, aspect.den] : null,
		rotation,
		bitDepth: coded?.bitDepth ?? profile.bitDepth,
		chroma: coded?.chroma ?? profile.chroma,
		fullRange: colour.fullRange ?? null,
		primaries: colour.primaries ?? null,
		transfer,
		matrix: colour.matrix ?? null,
		hdr: hdrFormats(transfer, container, stream),
		dolbyVision: container.dolbyVision,
		mastering: container.mastering ?? stream.mastering,
		light: container.light ?? stream.light,
		bitrate: extra?.bitrate ?? average ?? bitrate ?? (await countedBitrate(track, indexed)),
		bitrateEstimated: false,
	};
}

async function describeAudio(
	file: File,
	track: InputAudioTrack,
	container: ContainerFacts,
	indexed: boolean,
): Promise<AudioReport> {
	const extra = container.tracks.get(track.id);
	const [base, codec, codecString, channels, sampleRate, config, bitrate, average] = await Promise.all([
		flags(track, extra),
		track.getCodec(),
		track.getCodecParameterString(),
		track.getNumberOfChannels(),
		track.getSampleRate(),
		track.getDecoderConfig().catch(() => null),
		track.getBitrate(),
		track.getAverageBitrate(),
	]);
	const description = asBytes(config?.description);
	let profile = codec === 'aac' ? aacProfile(codecString) : null;
	let bitDepth = pcmDepth(codec) ?? (codec === 'flac' ? flacDepth(description) : null);
	if (codec === 'dts' || codec === 'truehd') {
		const [first] = await packets(track, 1).catch(() => []);
		if (first && codec === 'dts') profile = dtsExtension(first.data);
		if (first && codec === 'truehd' && trueHdAtmos(first.data)) profile = 'Atmos';
		if (codec === 'truehd') bitDepth = 24;
	}
	if (codec === 'eac3' && eac3Atmos(description)) profile = 'Atmos';
	const measured =
		extra?.bitrate ??
		average ??
		bitrate ??
		(await countedBitrate(track, indexed)) ??
		((await audioBitrate(file, track.id)) ?? 0) * 1000;
	return {
		...base,
		codec,
		profile,
		channels,
		sampleRate,
		bitDepth,
		bitrate: measured || null,
		bitrateMode: await bitrateMode(track, codec, profile).catch(() => null),
	};
}

/** Subtitle tracks and attachments, read by vixely-subs, which knows Matroska and MP4 text. */
async function readSubtitles(
	file: File,
	container: Promise<ContainerFacts>,
): Promise<{ subtitles: SubtitleReport[]; attachments: AttachmentInfo[] }> {
	const { SubtitleSource } = await import('../subtitle-source');
	const source = await SubtitleSource.open(file).catch(() => null);
	if (!source) return { subtitles: [], attachments: [] };
	const { tracks } = await container;
	try {
		return {
			subtitles: source.tracks.map((track) => ({
				id: track.id,
				codec: track.codec,
				language: track.language,
				name: track.name.trim() || null,
				default: track.default,
				forced: track.forced,
				commentary: false,
				hearingImpaired: tracks.get(track.id)?.hearingImpaired ?? false,
				described: tracks.get(track.id)?.described ?? false,
				duration: tracks.get(track.id)?.duration ?? null,
			})),
			attachments: source.attachments,
		};
	} finally {
		source.close();
	}
}

/**
 * A lone video track's bitrate, when the file doesn't tell it, from what is left of the file once
 * its sound is taken out: close enough, the container and subtitles weighing little beside.
 */
function estimateVideoBitrate(size: number, video: VideoReport[], audio: AudioReport[]) {
	const [only] = video;
	if (video.length !== 1 || !only || only.bitrate !== null || !only.duration) return;
	let sound = 0;
	for (const track of audio) {
		if (track.bitrate === null) return;
		sound += track.bitrate * (track.duration ?? only.duration);
	}
	const left = (size * 8 - sound) / only.duration;
	if (left <= 0) return;
	only.bitrate = left;
	only.bitrateEstimated = true;
}

async function read(file: File): Promise<MediaReport> {
	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
	try {
		const facts = readContainerFacts(file);
		const [container, videoTracks, audioTracks, text, format] = await Promise.all([
			facts,
			input.getVideoTracks(),
			input.getAudioTracks(),
			readSubtitles(file, facts),
			input.getFormat(),
		]);
		const indexed = format instanceof Mp4InputFormat || format instanceof QuickTimeInputFormat;
		const [video, audio] = await Promise.all([
			Promise.all(videoTracks.map(async (track) => describeVideo(track, container, indexed))),
			Promise.all(audioTracks.map(async (track) => describeAudio(file, track, container, indexed))),
		]);
		estimateVideoBitrate(file.size, video, audio);
		return {
			video,
			audio,
			...text,
			chapters: container.chapters,
			muxingApp: container.muxingApp,
			writingApp: container.writingApp,
			created: container.created,
		};
	} finally {
		input.dispose();
	}
}

const reports = new WeakMap<File, Promise<MediaReport | null>>();

/** The report of a file, read once; null when it can't be read. */
export async function mediaReport(file: File): Promise<MediaReport | null> {
	let report = reports.get(file);
	if (!report) {
		report = read(file).catch(() => null);
		reports.set(file, report);
	}
	return report;
}
