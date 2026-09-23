import {
	ALL_FORMATS,
	AudioSample,
	AudioSampleSink,
	AudioSampleSource,
	type AudioCodec,
	BlobSource,
	canEncodeAudio,
	FlacOutputFormat,
	Input,
	type MetadataTags,
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

const COMMON_RATES = [96_000, 88_200, 48_000, 44_100, 32_000, 24_000, 22_050, 16_000, 12_000, 11_025, 8000];

export const AUDIO_FORMATS: Record<AudioFormat, AudioFormatInfo> = {
	mp3: {
		label: 'MP3',
		extension: 'mp3',
		mime: 'audio/mpeg',
		codec: 'mp3',
		bitrates: [320, 256, 192, 160, 128, 96],
		defaultBitrate: 192,
		sampleRates: [48_000, 44_100, 32_000, 24_000, 22_050, 16_000, 12_000, 11_025, 8000],
		bitDepth: false,
	},
	aac: {
		label: 'AAC',
		extension: 'm4a',
		mime: 'audio/mp4',
		codec: 'aac',
		bitrates: [320, 256, 192, 160, 128, 96, 64],
		defaultBitrate: 192,
		sampleRates: [96_000, 88_200, 48_000, 44_100, 32_000, 24_000, 22_050, 16_000, 12_000, 11_025, 8000],
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
		sampleRates: COMMON_RATES,
		bitDepth: true,
	},
	wav: {
		label: 'WAV',
		extension: 'wav',
		mime: 'audio/wav',
		codec: 'pcm-s16',
		bitrates: [],
		defaultBitrate: 0,
		sampleRates: COMMON_RATES,
		bitDepth: true,
	},
};

export const AUDIO_FORMAT_ORDER: AudioFormat[] = ['mp3', 'aac', 'opus', 'flac', 'wav'];

export interface AudioExportSettings {
	format: AudioFormat;
	/** kb/s, for lossy formats. */
	bitrate: number;
	/** Output rate in hertz; null keeps the source rate when the format allows it. */
	sampleRate: number | null;
	channels: 'keep' | 'stereo' | 'mono';
	/** Lossless formats only. */
	bitDepth: 16 | 24;
	tags: { title: string; artist: string; album: string };
	/** Cover art: the source's, none, or a picture chosen by the user. */
	cover: 'keep' | 'none' | { data: Uint8Array; mimeType: string };
}

export interface SourceFormat {
	sampleRate: number;
	channels: number;
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

/**
 * Bitrates the encoder can reach at a sample rate. MP3 below 32 kHz uses the MPEG-2 and 2.5
 * layers, which stop at 160 and 64 kb/s.
 */
export function availableBitrates(format: AudioFormat, rate: number): number[] {
	const all = AUDIO_FORMATS[format].bitrates;
	if (format !== 'mp3' || rate >= 32_000) return all;
	const limit = rate >= 16_000 ? 160 : 64;
	const allowed = all.filter((kbps) => kbps <= limit);
	return allowed.length > 0 ? allowed : [limit];
}

/** The bitrate an export will use: the chosen one, or the closest the encoder can reach. */
export function outputBitrate(settings: AudioExportSettings, rate: number): number {
	const allowed = availableBitrates(settings.format, rate);
	return allowed.find((kbps) => kbps <= settings.bitrate) ?? allowed.at(-1) ?? settings.bitrate;
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
		title: settings.tags.title.trim() || undefined,
		artist: settings.tags.artist.trim() || undefined,
		album: settings.tags.album.trim() || undefined,
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

/**
 * Exports the audio as edited. The source is decoded in order, range by range, and every sample
 * is multiplied by the same volume curve playback uses; the result goes straight to the encoder
 * and to the destination, so memory stays flat whatever the length. Samples are laid end to end
 * by frame count, so the output has no gap and no overlap at cuts.
 */
export async function exportAudio({ file, doc, settings, source, save, signal, onProgress }: ExportAudioOptions) {
	const info = AUDIO_FORMATS[settings.format];
	const ranges = keptRanges(doc);
	const total = totalLength(ranges);
	const rate = outputRate(settings, source);
	const channels = outputChannels(settings, source);
	const depth = info.bitDepth ? settings.bitDepth : 16;
	const codec: AudioCodec = settings.format === 'wav' ? (depth === 24 ? 'pcm-s24' : 'pcm-s16') : info.codec;
	const bitrate = info.bitrates.length > 0 ? outputBitrate(settings, rate) * 1000 : undefined;
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
