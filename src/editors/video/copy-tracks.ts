/**
 * Writing the video without encoding its pictures again: their packets are copied as they are.
 * To remove passages, pictures can only be copied from a key frame, so each kept part starts on
 * the key frame at or before where it was asked to start, and so keeps a little of the passage
 * removed before it. It ends on the last picture that can be shown without the ones after it.
 * The sound is copied the same way, or decoded and encoded again when its level changes; sound
 * from other files can be added.
 */
import {
	ALL_FORMATS,
	type AudioCodec,
	AudioSampleSink,
	AudioSampleSource,
	BlobSource,
	type EncodedPacket,
	EncodedAudioPacketSource,
	EncodedPacketSink,
	EncodedVideoPacketSource,
	Input,
	type InputAudioTrack,
	type InputVideoTrack,
	Output,
	type Target,
} from 'mediabunny';
import type { Range } from '@/document/timemap';
import { ensureEncoder } from '../audio/export';
import { gainOf, type Placed, placeAudio, placeRanges } from './audio-pieces';
import { composeTurn, type Turn, type VideoMeta } from './document';
import { CONTAINERS, type VideoContainer, writeMeta } from './export';

/** A part copied: its source range, and the picture time that ends it in decode order. */
export interface Part extends Range {
	stop: number;
}

/** Sorts parts and merges those that meet or overlap. */
export function mergeParts(parts: readonly Part[]): Part[] {
	const merged: Part[] = [];
	for (const part of parts.toSorted((a, b) => a.start - b.start)) {
		const last = merged.at(-1);
		if (last && part.start <= last.end) {
			last.end = Math.max(last.end, part.end);
			last.stop = Math.max(last.stop, part.stop);
		} else merged.push({ ...part });
	}
	return merged;
}

/**
 * Where a part asked to end at `end` really ends: pictures are copied in decode order up to the
 * first one shown at or after `end`, so it ends with the last of them shown.
 */
async function partEnd(sink: EncodedPacketSink, end: number): Promise<number> {
	const key = await sink.getKeyPacket(end, { verifyKeyPackets: true });
	if (!key || key.timestamp >= end) return end;
	let last = key.timestamp + key.duration;
	for await (const packet of sink.packets(key, undefined, { metadataOnly: true })) {
		if (packet.timestamp >= end) break;
		last = Math.max(last, packet.timestamp + packet.duration);
	}
	return last;
}

/** The kept ranges as they can be copied: each started on a key frame. */
export async function copiedParts(track: InputVideoTrack, ranges: readonly Range[]): Promise<Part[]> {
	const sink = new EncodedPacketSink(track);
	const first = await sink.getFirstKeyPacket({ verifyKeyPackets: true });
	const parts = await Promise.all(
		ranges.map(async (range) => {
			const [key, end] = await Promise.all([
				sink.getKeyPacket(range.start, { verifyKeyPackets: true }),
				partEnd(sink, range.end),
			]);
			return { start: (key ?? first)?.timestamp ?? 0, end, stop: range.end };
		}),
	);
	return mergeParts(parts.filter((part) => part.end > part.start));
}

/**
 * Whether a shortened video is copied part by part. MP4 trimmed at both ends is copied exactly
 * instead, an edit list hiding the pictures before the start; Matroska has none.
 */
export function copiesParts(container: VideoContainer, cuts: boolean): boolean {
	return cuts || container === 'mkv' || container === 'webm';
}

/** The source ranges a copy of the kept ranges will really hold. */
export async function copiedRanges(file: File, ranges: readonly Range[]): Promise<Range[]> {
	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
	try {
		const video = (await input.getVideoTracks())[0];
		if (!video) return [...ranges];
		return (await copiedParts(video, ranges)).map(({ start, end }) => ({ start, end }));
	} finally {
		input.dispose();
	}
}

/** How far ahead of the slowest track another may run, in seconds: more would pile up in memory. */
const MAX_GAP = 3;

/** Keeps the tracks written side by side, so the muxer can interleave them as they come. */
class Pace {
	private readonly times: number[];
	private waiting: (() => void)[] = [];
	private stopped = false;

	constructor(count: number, signal: AbortSignal) {
		this.times = Array.from({ length: count }, () => Number.NEGATIVE_INFINITY);
		signal.addEventListener('abort', () => {
			this.stop();
		});
	}

	async at(track: number, time: number) {
		this.times[track] = time;
		this.release();
		while (!this.stopped && time - Math.min(...this.times) > MAX_GAP) {
			// oxlint-disable-next-line no-await-in-loop -- waits for the other tracks to catch up
			await new Promise<void>((resolve) => this.waiting.push(resolve));
		}
	}

	/** Lets every track go, when writing stops. */
	stop() {
		this.stopped = true;
		this.release();
	}

	done(track: number) {
		this.times[track] = Number.POSITIVE_INFINITY;
		this.release();
	}

	private release() {
		const waiting = this.waiting;
		this.waiting = [];
		for (const resolve of waiting) resolve();
	}
}

/** A sound track to write. */
export interface AudioPlan {
	/**
	 * Where the sound comes from: a track of the video, by its ID or its rank among the sound
	 * tracks (from 1), or the sound of another file.
	 */
	from: { id: number } | { number: number } | { file: File };
	/** Change of level, in dB. */
	decibels: number;
	/**
	 * Codec it is encoded again in; 'auto' keeps its own where it can. Null copies it as it is,
	 * unless its level changes or the container doesn't take it.
	 */
	encode: AudioCodec | 'auto' | null;
	/** Bitrate when encoded again, in kb/s. */
	bitrate: number;
	/** Source ranges it takes, in order; absent, those of the pictures. */
	ranges?: readonly Range[];
	language: string;
	name: string;
	default: boolean;
}

export interface CopyJob {
	file: File;
	container: VideoContainer;
	/** Source ranges kept, in order; null keeps the whole video as it is. */
	ranges: readonly Range[] | null;
	audio: readonly AudioPlan[];
	/** Turn and mirror added by the edits, written for players to apply. */
	turn?: Turn | null;
	/** Title, artist, date and cover as edited; absent or null keeps the file's. */
	meta?: VideoMeta | null;
}

interface PartPlaced {
	range: Part;
	shift: number;
}

/** The whole video, where it is. */
const WHOLE_PART: readonly PartPlaced[] = [
	{
		range: { start: Number.NEGATIVE_INFINITY, end: Number.POSITIVE_INFINITY, stop: Number.POSITIVE_INFINITY },
		shift: 0,
	},
];

/** Parts laid back to back from the start of the output. */
function placeParts(parts: readonly Part[]): PartPlaced[] {
	let at = 0;
	return parts.map((range) => {
		const shift = at - range.start;
		at += range.end - range.start;
		return { range, shift };
	});
}

async function audioTrackOf(input: Input, plan: AudioPlan, open: (file: File) => Input) {
	if ('file' in plan.from) return open(plan.from.file).getPrimaryAudioTrack();
	const tracks = await input.getAudioTracks();
	if ('number' in plan.from) return tracks[plan.from.number - 1] ?? null;
	const { id } = plan.from;
	return tracks.find((track) => track.id === id) ?? null;
}

/** The codec sound is encoded again in: its own when it can be, else the container's usual one. */
function soundCodec(own: AudioCodec | null, container: VideoContainer): AudioCodec {
	if ((own === 'aac' || own === 'opus') && CONTAINERS[container].audio.includes(own)) return own;
	return container === 'mp4' || container === 'mov' ? 'aac' : 'opus';
}

/**
 * Writes the video into `target`, its pictures copied as they are: only the kept parts, each
 * started on a key frame, when ranges are given. Resolves with the source ranges really copied,
 * null for the whole video; stopping throws an AbortError.
 */
export async function copyTracks(
	job: CopyJob,
	target: Target,
	onProgress: (share: number) => void,
	signal: AbortSignal,
): Promise<Range[] | null> {
	const inputs = new Map<File, Input>();
	const open = (file: File) => {
		let input = inputs.get(file);
		if (!input) {
			input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
			inputs.set(file, input);
		}
		return input;
	};
	const output = new Output({ format: CONTAINERS[job.container].create(), target });
	try {
		const input = open(job.file);
		const video = (await input.getVideoTracks())[0];
		if (!video) throw new Error('No video track');
		const parts = job.ranges ? await copiedParts(video, job.ranges) : null;
		const placed = parts ? placeParts(parts) : WHOLE_PART;
		const total = parts
			? parts.reduce((sum, part) => sum + part.end - part.start, 0)
			: await video.computeDuration();

		const found = await Promise.all(
			job.audio.map(async (plan) => {
				const track = await audioTrackOf(input, plan, open);
				return track ? { plan, track } : null;
			}),
		);
		const audio = found.filter((entry) => entry !== null);
		const pace = new Pace(1 + audio.length, signal);

		const videoCodec = await video.getCodec();
		if (!videoCodec) throw new Error('Unknown video codec');
		const videoSource = new EncodedVideoPacketSource(videoCodec);
		const [rotation, flip, tags] = await Promise.all([
			video.getRotation(),
			video.getFlip(),
			input.getMetadataTags().catch(() => ({})),
		]);
		const turn = composeTurn({ rotation, flip }, job.turn ?? { rotation: 0, flip: false });
		output.setMetadataTags(writeMeta(tags, job.meta ?? null));
		output.addVideoTrack(videoSource, {
			rotation: turn.rotation,
			flip: turn.flip,
			languageCode: await video.getLanguageCode(),
			name: (await video.getName()) ?? undefined,
			disposition: await video.getDisposition(),
		});
		const pumps: (() => Promise<void>)[] = [
			async () =>
				copyVideo(video, videoSource, placed, pace, signal, (time) => {
					onProgress(Math.min(1, time / total));
				}),
		];

		for (const [index, { plan, track }] of audio.entries()) {
			const metadata = {
				languageCode: plan.language,
				name: plan.name || undefined,
				disposition: { default: plan.default },
			};
			// Sound longer than the pictures stops with them.
			const where: readonly Placed[] = plan.ranges
				? placeRanges(plan.ranges)
				: parts
					? placed
					: [{ range: { start: Number.NEGATIVE_INFINITY, end: total }, shift: 0 }];
			// oxlint-disable-next-line no-await-in-loop -- a few tracks, read once
			const own = await track.getCodec();
			const copied =
				plan.encode === null &&
				plan.decibels === 0 &&
				own !== null &&
				CONTAINERS[job.container].audio.includes(own);
			if (!copied) {
				const codec =
					plan.encode === null || plan.encode === 'auto' ? soundCodec(own, job.container) : plan.encode;
				const { bitrate } = plan;
				// Browsers without their own AAC encoder (Chromium) get the WebAssembly one.
				// oxlint-disable-next-line no-await-in-loop -- a few tracks, set up once
				await ensureEncoder(codec, { numberOfChannels: track.numberOfChannels, sampleRate: track.sampleRate });
				const source = new AudioSampleSource({ codec, bitrate: bitrate * 1000 });
				output.addAudioTrack(source, metadata);
				const gain = gainOf(plan.decibels);
				pumps.push(async () => encodeAudio(track, source, where, gain, pace, 1 + index, signal));
			} else {
				const source = new EncodedAudioPacketSource(own);
				output.addAudioTrack(source, metadata);
				pumps.push(async () => copyAudio(track, source, where, pace, 1 + index, signal));
			}
		}

		await output.start();
		try {
			await Promise.all(pumps.map(async (pump) => pump()));
		} catch (error) {
			pace.stop();
			throw error;
		}
		if (signal.aborted) {
			await output.cancel();
			throw new DOMException('Stopped', 'AbortError');
		}
		await output.finalize();
		return parts ? parts.map(({ start, end }) => ({ start, end })) : null;
	} catch (error) {
		if (output.state !== 'finalized' && output.state !== 'canceled') await output.cancel().catch(() => undefined);
		throw error;
	} finally {
		for (const input of inputs.values()) input.dispose();
	}
}

/** Copies the pictures of each part, from its key frame up to the picture that ends it. */
async function copyVideo(
	video: InputVideoTrack,
	source: EncodedVideoPacketSource,
	placed: readonly PartPlaced[],
	pace: Pace,
	signal: AbortSignal,
	onTime: (time: number) => void,
) {
	const sink = new EncodedPacketSink(video);
	const decoderConfig = (await video.getDecoderConfig()) ?? undefined;
	let first = true;
	try {
		for (const { range, shift } of placed) {
			const start =
				// oxlint-disable-next-line no-await-in-loop -- parts are copied in order
				(await sink.getKeyPacket(range.start, { verifyKeyPackets: true })) ??
				// oxlint-disable-next-line no-await-in-loop -- parts are copied in order
				(await sink.getFirstKeyPacket({ verifyKeyPackets: true }));
			if (!start) continue;
			// oxlint-disable-next-line no-await-in-loop -- parts are copied in order
			for await (const packet of sink.packets(start, undefined, { verifyKeyPackets: true })) {
				if (signal.aborted) return;
				if (packet.timestamp >= range.stop) break;
				// Pictures shown before the key frame lean on the part left out: they can't be shown.
				if (packet.timestamp < range.start) continue;
				const timestamp = packet.timestamp + shift;
				await source.add(packet.clone({ timestamp }), first ? { decoderConfig } : undefined);
				first = false;
				onTime(timestamp);
				await pace.at(0, timestamp);
			}
		}
		source.close();
	} finally {
		pace.done(0);
	}
}

/** Copies the sound of each part: the packets that start inside it, moved to its place. */
async function copyAudio(
	track: InputAudioTrack,
	source: EncodedAudioPacketSource,
	placed: readonly Placed[],
	pace: Pace,
	index: number,
	signal: AbortSignal,
) {
	const sink = new EncodedPacketSink(track);
	const decoderConfig = (await track.getDecoderConfig()) ?? undefined;
	let first = true;
	try {
		for (const { range, shift } of placed) {
			// oxlint-disable-next-line no-await-in-loop -- parts are copied in order
			const start: EncodedPacket | null = (await sink.getPacket(range.start)) ?? (await sink.getFirstPacket());
			if (!start) continue;
			// oxlint-disable-next-line no-await-in-loop -- parts are copied in order
			for await (const packet of sink.packets(start)) {
				if (signal.aborted) return;
				if (packet.timestamp >= range.end) break;
				if (packet.timestamp < range.start) continue;
				const timestamp = packet.timestamp + shift;
				await source.add(packet.clone({ timestamp }), first ? { decoderConfig } : undefined);
				first = false;
				await pace.at(index, timestamp);
			}
		}
		source.close();
	} finally {
		pace.done(index);
	}
}

/** Decodes the sound of each part, changes its level and encodes it again. */
async function encodeAudio(
	track: InputAudioTrack,
	source: AudioSampleSource,
	placed: readonly Placed[],
	gain: number,
	pace: Pace,
	index: number,
	signal: AbortSignal,
) {
	const sink = new AudioSampleSink(track);
	try {
		for (const part of placed) {
			const { start, end } = part.range;
			const samples = sink.samples(
				Number.isFinite(start) ? start : undefined,
				Number.isFinite(end) ? end : undefined,
			);
			// oxlint-disable-next-line no-await-in-loop -- parts are encoded in order
			for await (const sample of samples) {
				const pieces = placeAudio(sample, [part], 0, gain);
				sample.close();
				for (const piece of pieces) {
					if (!signal.aborted) {
						// oxlint-disable-next-line no-await-in-loop -- pieces are encoded in order
						await source.add(piece);
						// oxlint-disable-next-line no-await-in-loop -- pieces are encoded in order
						await pace.at(index, piece.timestamp);
					}
					piece.close();
				}
				if (signal.aborted) return;
			}
		}
		source.close();
	} finally {
		pace.done(index);
	}
}
