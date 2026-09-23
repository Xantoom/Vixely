import {
	ALL_FORMATS,
	AudioSample,
	AudioSampleSink,
	AudioSampleSource,
	type AudioCodec,
	BlobSource,
	canEncodeAudio,
	EncodedAudioPacketSource,
	EncodedPacketSink,
	FlacOutputFormat,
	Input,
	type MetadataTags,
	MkvOutputFormat,
	Mp3OutputFormat,
	Mp4OutputFormat,
	OggOutputFormat,
	Output,
	type OutputFormat,
	Quality,
	WavOutputFormat,
} from 'mediabunny';
import type { GainPoint } from '@/document/gain-curve';
import { totalLength } from '@/document/timemap';
import { DECODER_PREROLL } from '@/media/decoder';
import type { SaveTarget } from '@/media/save-target';
import { envelope, keptRanges, type AudioDoc } from './document';

export type AudioFormat = 'mp3' | 'aac' | 'opus' | 'flac' | 'wav';

export interface AudioFormatInfo {
	label: string;
	extension: string;
	mime: string;
	codec: AudioCodec;
	/** Bitrates offered, in kb/s, highest first. Empty for lossless formats. */
	bitrates: number[];
	defaultBitrate: number;
	/** Sample rates the encoder accepts, in hertz. */
	sampleRates: number[];
	/** Whether the bit depth can be chosen (lossless formats). */
	bitDepth: boolean;
}

/** 48 kHz is the video standard, 44.1 kHz the CD one: every player reads both, nothing else is needed. */
const RATES = [48_000, 44_100];

export const AUDIO_FORMATS: Record<AudioFormat, AudioFormatInfo> = {
	mp3: {
		label: 'MP3',
		extension: 'mp3',
		mime: 'audio/mpeg',
		codec: 'mp3',
		bitrates: [320, 256, 192, 160, 128, 96],
		defaultBitrate: 192,
		sampleRates: RATES,
		bitDepth: false,
	},
	aac: {
		label: 'AAC',
		extension: 'm4a',
		mime: 'audio/mp4',
		codec: 'aac',
		bitrates: [320, 256, 192, 160, 128, 96, 64],
		defaultBitrate: 192,
		sampleRates: RATES,
		bitDepth: false,
	},
	opus: {
		label: 'Opus',
		extension: 'opus',
		mime: 'audio/ogg',
		codec: 'opus',
		bitrates: [256, 192, 160, 128, 96, 64, 48],
		defaultBitrate: 128,
		// Opus always runs at 48 kHz internally; other rates are resampled by the decoder anyway.
		sampleRates: [48_000],
		bitDepth: false,
	},
	flac: {
		label: 'FLAC',
		extension: 'flac',
		mime: 'audio/flac',
		codec: 'flac',
		bitrates: [],
		defaultBitrate: 0,
		sampleRates: RATES,
		bitDepth: true,
	},
	wav: {
		label: 'WAV',
		extension: 'wav',
		mime: 'audio/wav',
		codec: 'pcm-s16',
		bitrates: [],
		defaultBitrate: 0,
		sampleRates: RATES,
		bitDepth: true,
	},
};

export const AUDIO_FORMAT_ORDER: AudioFormat[] = ['mp3', 'aac', 'opus', 'flac', 'wav'];

export interface AudioExportSettings {
	/**
	 * `copy` keeps the original encoding: the audio packets are copied as they are, without any
	 * loss or wait. Only possible when the sound itself is unchanged (no gain, fades, normalization).
	 */
	mode: 'copy' | 'encode';
	format: AudioFormat;
	/** kb/s, for lossy formats. */
	bitrate: number;
	/** Output rate in hertz; null keeps the source rate when the format allows it. */
	sampleRate: number | null;
	channels: 'keep' | 'stereo' | 'mono';
	/** Lossless formats only. */
	bitDepth: 16 | 24;
	/** Null keeps the source's own tags, as batches do. */
	tags: { title: string; artist: string; album: string } | null;
	/** Cover art: the source's, none, or a picture chosen by the user. */
	cover: 'keep' | 'none' | { data: Uint8Array; mimeType: string };
}

/** What the source audio is, read once when a file opens. Export settings start from it. */
export interface SourceFormat {
	codec: AudioCodec | null;
	sampleRate: number;
	channels: number;
	/** Average bitrate in kb/s, null when unknown. */
	bitrate: number | null;
	/** Bits per sample of lossless audio: 24 for high-resolution sources, 16 otherwise. */
	bitDepth: 16 | 24;
}

/** Reads the STREAMINFO block of a FLAC decoder description for its bits per sample. */
function flacBitDepth(description: AllowSharedBufferSource | undefined): 16 | 24 {
	if (!description) return 16;
	const bytes = ArrayBuffer.isView(description)
		? new Uint8Array(description.buffer, description.byteOffset, description.byteLength)
		: new Uint8Array(description);
	// "fLaC", a 4-byte block header, then STREAMINFO; bits per sample − 1 sit across its bytes 12 and 13.
	const info = bytes[0] === 0x66 ? 8 : 0;
	const high = bytes[info + 12] ?? 0;
	const low = bytes[info + 13] ?? 0;
	const bits = (((high & 0x01) << 4) | (low >> 4)) + 1;
	return bits > 16 ? 24 : 16;
}

export async function readSourceFormat(file: File): Promise<SourceFormat | null> {
	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
	try {
		const track = await input.getPrimaryAudioTrack();
		if (!track) return null;
		const codec = track.codec;
		const [stats, config] = await Promise.all([
			track.computePacketStats(200).catch(() => null),
			codec === 'flac' ? track.getDecoderConfig().catch(() => null) : Promise.resolve(null),
		]);
		const wide = codec === 'pcm-s24' || codec === 'pcm-s24be' || codec === 'pcm-s32' || codec?.startsWith('pcm-f');
		return {
			codec,
			sampleRate: track.sampleRate,
			channels: track.numberOfChannels,
			bitrate: stats && stats.averageBitrate > 0 ? Math.round(stats.averageBitrate / 1000) : null,
			bitDepth: wide ? 24 : codec === 'flac' ? flacBitDepth(config?.description) : 16,
		};
	} catch {
		return null;
	} finally {
		input.dispose();
	}
}

/** The format that re-encodes a source most faithfully, when the user converts. */
function formatFor(codec: AudioCodec | null): AudioFormat {
	if (codec === 'mp3' || codec === 'aac' || codec === 'opus' || codec === 'flac') return codec;
	if (codec?.startsWith('pcm-')) return 'wav';
	// Vorbis has no encoder here; Opus is its successor.
	return codec === 'vorbis' ? 'opus' : 'mp3';
}

/** Export settings that reproduce the source: same codec, bitrate, rate, channels and depth. */
export function settingsFromSource(source: SourceFormat, current: AudioExportSettings): AudioExportSettings {
	const format = formatFor(source.codec);
	const info = AUDIO_FORMATS[format];
	const bitrate =
		source.bitrate === null || info.bitrates.length === 0
			? info.defaultBitrate
			: info.bitrates.reduce((best, kbps) =>
					Math.abs(kbps - (source.bitrate ?? 0)) < Math.abs(best - (source.bitrate ?? 0)) ? kbps : best,
				);
	return { ...current, mode: 'copy', format, bitrate, sampleRate: null, channels: 'keep', bitDepth: source.bitDepth };
}

/** Where copied packets can go, by codec: the natural container of each, Matroska for the rest. */
interface CopyTarget {
	extension: string;
	mime: string;
	label: string;
	create: () => OutputFormat;
}

function copyTarget(codec: AudioCodec): CopyTarget | null {
	const candidates: CopyTarget[] = [];
	if (codec === 'mp3')
		candidates.push({ extension: 'mp3', mime: 'audio/mpeg', label: 'MP3', create: () => new Mp3OutputFormat() });
	if (codec === 'aac')
		candidates.push({
			extension: 'm4a',
			mime: 'audio/mp4',
			label: 'AAC',
			create: () => new Mp4OutputFormat({ fastStart: false }),
		});
	if (codec === 'opus' || codec === 'vorbis')
		candidates.push({
			extension: codec === 'opus' ? 'opus' : 'ogg',
			mime: 'audio/ogg',
			label: 'Ogg',
			create: () => new OggOutputFormat(),
		});
	if (codec === 'flac')
		candidates.push({ extension: 'flac', mime: 'audio/flac', label: 'FLAC', create: () => new FlacOutputFormat() });
	if (codec.startsWith('pcm-'))
		candidates.push({
			extension: 'wav',
			mime: 'audio/wav',
			label: 'WAV',
			create: () => new WavOutputFormat({ metadataFormat: 'id3' }),
		});
	candidates.push({
		extension: 'mka',
		mime: 'audio/x-matroska',
		label: 'Matroska',
		create: () => new MkvOutputFormat(),
	});
	return candidates.find((target) => target.create().getSupportedCodecs().includes(codec)) ?? null;
}

/** Name, type and extension of the file an export produces. */
export function outputType(
	settings: AudioExportSettings,
	source: SourceFormat,
): { extension: string; mime: string; label: string } {
	if (settings.mode === 'copy' && source.codec) {
		const target = copyTarget(source.codec);
		if (target) return target;
	}
	return AUDIO_FORMATS[settings.format];
}

/**
 * Why the original encoding can't be kept, or null when it can. Changing the sound itself (gain,
 * fades, normalization) means decoding and encoding again; cutting doesn't.
 */
export function copyBlocker(doc: AudioDoc, source: SourceFormat | null): 'volume' | 'codec' | null {
	if (!source?.codec || !copyTarget(source.codec)) return 'codec';
	if (doc.gain !== 0 || doc.normalize !== null || doc.fadeIn > 0 || doc.fadeOut > 0) return 'volume';
	return null;
}

/** The sample rate an export will have: the chosen one, or the source's if the encoder accepts it. */
export function outputRate(settings: AudioExportSettings, source: SourceFormat): number {
	const rates = AUDIO_FORMATS[settings.format].sampleRates;
	const wanted = settings.sampleRate ?? source.sampleRate;
	if (rates.includes(wanted)) return wanted;
	// The closest rate above, so nothing audible is lost; the highest otherwise.
	return rates.toReversed().find((rate) => rate >= wanted) ?? rates[0] ?? 48_000;
}

export function outputChannels(settings: AudioExportSettings, source: SourceFormat): number {
	if (settings.channels === 'mono') return 1;
	if (settings.channels === 'stereo') return 2;
	// Lossy encoders here handle mono and stereo; wider layouts are folded to stereo.
	return AUDIO_FORMATS[settings.format].bitDepth ? source.channels : Math.min(2, source.channels);
}

/** Size a lossless export will reach, in bytes, to choose a WAV layout that can hold it. */
function pcmBytes(seconds: number, rate: number, channels: number, depth: number): number {
	return seconds * rate * channels * (depth / 8);
}

const registered = new Set<AudioCodec>();

/**
 * Makes an encoder available for the codec. The browser's own encoder is used when it has one;
 * otherwise a WebAssembly encoder is loaded, only for the formats that need it.
 */
async function ensureEncoder(
	codec: AudioCodec,
	options: { numberOfChannels: number; sampleRate: number; bitrate?: number },
) {
	if (registered.has(codec) || codec.startsWith('pcm-')) return;
	if (await canEncodeAudio(codec, options)) return;
	if (codec === 'mp3') (await import('@mediabunny/mp3-encoder')).registerMp3Encoder();
	else if (codec === 'aac') (await import('@mediabunny/aac-encoder')).registerAacEncoder();
	else if (codec === 'flac') (await import('@mediabunny/flac-encoder')).registerFlacEncoder();
	else return;
	registered.add(codec);
}

/** Whether this browser can export a format at all. Opus depends on the browser's encoder. */
export async function canExport(format: AudioFormat): Promise<boolean> {
	if (format !== 'opus') return true;
	return canEncodeAudio('opus', { numberOfChannels: 2, sampleRate: 48_000, bitrate: 128_000 });
}

function outputFormat(settings: AudioExportSettings, bytes: number): OutputFormat {
	switch (settings.format) {
		case 'mp3':
			return new Mp3OutputFormat();
		case 'aac':
			// The index goes at the end: the file is written as it is encoded, never held in memory.
			return new Mp4OutputFormat({ fastStart: false });
		case 'opus':
			return new OggOutputFormat();
		case 'flac':
			return new FlacOutputFormat();
		case 'wav':
			// Past 4 GB a WAV file needs the RF64 layout. ID3 keeps the cover and the tags.
			return new WavOutputFormat({ large: bytes > 4_000_000_000, metadataFormat: 'id3' });
	}
}

async function outputTags(input: Input, settings: AudioExportSettings): Promise<MetadataTags> {
	const source = await input.getMetadataTags().catch((): MetadataTags => ({}));
	const tags: MetadataTags = {
		description: source.description,
		albumArtist: source.albumArtist,
		trackNumber: source.trackNumber,
		tracksTotal: source.tracksTotal,
		discNumber: source.discNumber,
		discsTotal: source.discsTotal,
		genre: source.genre,
		date: source.date,
		lyrics: source.lyrics,
		comment: source.comment,
		title: settings.tags ? settings.tags.title.trim() || undefined : source.title,
		artist: settings.tags ? settings.tags.artist.trim() || undefined : source.artist,
		album: settings.tags ? settings.tags.album.trim() || undefined : source.album,
	};
	if (settings.cover === 'keep') tags.images = source.images;
	else if (settings.cover !== 'none') tags.images = [{ ...settings.cover, kind: 'coverFront' }];
	return tags;
}

/** Reads the volume curve along increasing output times, one segment at a time. */
class CurveReader {
	private index = 0;
	constructor(private points: readonly GainPoint[]) {}

	at(time: number): number {
		const points = this.points;
		while (this.index < points.length - 1 && (points[this.index + 1]?.time ?? 0) <= time) this.index += 1;
		const before = points[this.index];
		const after = points[this.index + 1];
		if (!before) return 1;
		if (!after || after.time <= before.time || time <= before.time) return before.gain;
		return before.gain + ((after.gain - before.gain) * (time - before.time)) / (after.time - before.time);
	}
}

export interface ExportAudioOptions {
	file: File;
	doc: AudioDoc;
	settings: AudioExportSettings;
	source: SourceFormat;
	save: SaveTarget;
	signal: AbortSignal;
	onProgress: (fraction: number) => void;
}

/** Exports the audio as edited, copying the original encoding when the settings allow it. */
export async function exportAudio(options: ExportAudioOptions) {
	const { doc, settings, source } = options;
	if (settings.mode === 'copy' && copyBlocker(doc, source) === null) {
		await copyAudio(options);
		return;
	}
	await encodeAudio(options);
}

/**
 * Keeps the original encoding: the audio packets of the kept ranges are copied into a new file,
 * with no decoding and no loss. Cuts fall on packet edges (about 20 ms for MP3, AAC and Opus); a
 * packet belongs to a range when its middle does.
 */
async function copyAudio({ file, doc, settings, source, save, signal, onProgress }: ExportAudioOptions) {
	const codec = source.codec;
	const target = codec ? copyTarget(codec) : null;
	if (!codec || !target) throw new Error('This audio cannot be copied as it is.');
	const ranges = keptRanges(doc);
	const total = totalLength(ranges);
	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
	const output = new Output({ format: target.create(), target: save.target });
	try {
		const track = await input.getPrimaryAudioTrack();
		if (!track) throw new Error('The file has no audio track.');
		const packets = new EncodedAudioPacketSource(codec);
		output.addAudioTrack(packets);
		output.setMetadataTags(await outputTags(input, settings));
		await output.start();
		const decoderConfig = (await track.getDecoderConfig()) ?? undefined;
		const sink = new EncodedPacketSink(track);
		const firstPacket = await sink.getFirstPacket();
		let written = 0;
		// An untouched start keeps its original timestamps, encoder delay included.
		let outputTime = firstPacket && (ranges[0]?.start ?? 0) <= 0 ? Math.min(0, firstPacket.timestamp) : 0;
		const startTime = outputTime;
		for (const range of ranges) {
			// oxlint-disable-next-line no-await-in-loop
			const start = (await sink.getPacket(range.start)) ?? firstPacket;
			if (!start) continue;
			// Ranges are copied in order, each after the previous one.
			// oxlint-disable-next-line no-await-in-loop
			for await (const packet of sink.packets(start)) {
				if (signal.aborted) throw new DOMException('The export was stopped.', 'AbortError');
				const middle = packet.timestamp + packet.duration / 2;
				if (middle >= range.end) break;
				if (middle < range.start) continue;
				const copy = packet.clone({ timestamp: outputTime });
				// oxlint-disable-next-line no-await-in-loop
				await packets.add(copy, written === 0 ? { decoderConfig } : undefined);
				written += 1;
				outputTime += packet.duration;
				onProgress(Math.min(1, (outputTime - startTime) / total));
			}
		}
		await output.finalize();
		await save.commit();
	} catch (error) {
		await output.cancel().catch(() => undefined);
		await save.discard().catch(() => undefined);
		throw error;
	} finally {
		input.dispose();
	}
}

/**
 * Exports the audio as edited. The source is decoded in order, range by range, and every sample
 * is multiplied by the same volume curve playback uses; the result goes straight to the encoder
 * and to the destination, so memory stays flat whatever the length. Samples are laid end to end
 * by frame count, so the output has no gap and no overlap at cuts.
 */
async function encodeAudio({ file, doc, settings, source, save, signal, onProgress }: ExportAudioOptions) {
	const info = AUDIO_FORMATS[settings.format];
	const ranges = keptRanges(doc);
	const total = totalLength(ranges);
	const rate = outputRate(settings, source);
	const channels = outputChannels(settings, source);
	const depth = info.bitDepth ? settings.bitDepth : 16;
	const codec: AudioCodec = settings.format === 'wav' ? (depth === 24 ? 'pcm-s24' : 'pcm-s16') : info.codec;
	const bitrate = info.bitrates.length > 0 ? settings.bitrate * 1000 : undefined;
	await ensureEncoder(codec, { numberOfChannels: channels, sampleRate: rate, bitrate });

	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
	const output = new Output({
		format: outputFormat(settings, pcmBytes(total, rate, channels, depth)),
		target: save.target,
	});
	try {
		const track = await input.getPrimaryAudioTrack();
		if (!track) throw new Error('The file has no audio track.');
		const encoder = new AudioSampleSource({
			codec,
			quality: bitrate ? new Quality({ bitrate }) : undefined,
			transform: {
				numberOfChannels: channels,
				sampleRate: rate,
				sampleFormat: info.bitDepth ? (depth === 24 ? 's32' : 's16') : undefined,
			},
		});
		output.addAudioTrack(encoder);
		output.setMetadataTags(await outputTags(input, settings));
		await output.start();

		const curve = new CurveReader(envelope(doc));
		// Rounding to 16 bits after a volume change leaves a faint distortion on quiet passages;
		// a little triangular noise (dither) turns it into an inaudible hiss, as mastering tools do.
		const dither = depth === 16 && info.bitDepth && (doc.gain !== 0 || doc.fadeIn > 0 || doc.fadeOut > 0);
		const lsb = 1 / 32_768;
		const sink = new AudioSampleSink(track);
		let written = 0;
		let outputTime = 0;
		for (const range of ranges) {
			const from = Math.max(0, range.start - DECODER_PREROLL);
			// Ranges are encoded in order, each after the previous one.
			// oxlint-disable-next-line no-await-in-loop
			for await (const sample of sink.samples(from, range.end)) {
				if (signal.aborted) {
					sample.close();
					throw new DOMException('The export was stopped.', 'AbortError');
				}
				const sampleRate = sample.sampleRate;
				const frames = sample.numberOfFrames;
				const first = Math.max(0, Math.round((range.start - sample.timestamp) * sampleRate));
				const last = Math.min(frames, Math.round((range.end - sample.timestamp) * sampleRate));
				if (last <= first) {
					sample.close();
					continue;
				}
				const count = last - first;
				const planes = sample.numberOfChannels;
				const data = new Float32Array(count * planes);
				for (let c = 0; c < planes; c++) {
					sample.copyTo(data.subarray(c * count, (c + 1) * count), {
						planeIndex: c,
						format: 'f32-planar',
						frameOffset: first,
						frameCount: count,
					});
				}
				sample.close();

				for (let i = 0; i < count; i++) {
					const gain = curve.at(outputTime + i / sampleRate);
					for (let c = 0; c < planes; c++) {
						const at = c * count + i;
						let value = (data[at] ?? 0) * gain;
						if (dither) value += (Math.random() - Math.random()) * lsb;
						data[at] = value;
					}
				}

				const edited = new AudioSample({
					data,
					format: 'f32-planar',
					numberOfChannels: planes,
					sampleRate,
					timestamp: written / sampleRate,
				});
				written += count;
				outputTime = written / sampleRate;
				// Waits for the encoder and the disk, so decoding never runs far ahead of them.
				// oxlint-disable-next-line no-await-in-loop
				await encoder.add(edited);
				edited.close();
				onProgress(Math.min(1, outputTime / total));
			}
		}
		await output.finalize();
		await save.commit();
	} catch (error) {
		await output.cancel().catch(() => undefined);
		await save.discard().catch(() => undefined);
		throw error;
	} finally {
		input.dispose();
	}
}
