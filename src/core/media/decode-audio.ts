import { AudioBufferSink, type InputAudioTrack } from "mediabunny";
import type { WaveformPeaks } from "../audio/waveform.ts";
import { MediaError } from "./types.ts";
import type { OpenedInput } from "./input.ts";

/**
 * Audio decoding, kept behind the facade (I3).
 *
 * Decoding through Mediabunny rather than `AudioContext.decodeAudioData` is a
 * deliberate choice: a file the browser cannot natively play — AC-3, DTS — still
 * opens, and preview and export read the very same samples.
 */

export type DecodedAudio = {
	readonly buffer: AudioBuffer;
	readonly sampleRate: number;
	readonly channels: number;
	readonly durationSec: number;
};

export type DecodeProgress = (ratio: number) => void;

async function resolveTrack(
	opened: OpenedInput,
	trackId: number | undefined,
): Promise<InputAudioTrack> {
	const tracks = await opened.input.getAudioTracks();
	const track =
		trackId === undefined
			? ((await opened.input.getPrimaryAudioTrack()) ?? tracks[0])
			: (tracks.find((candidate) => candidate.id === trackId) ?? tracks[0]);

	if (track === undefined) {
		throw new MediaError("this file carries no audio track", "decode");
	}
	return track;
}

export async function decodeAudioTrack(
	opened: OpenedInput,
	options: {
		readonly trackId?: number;
		readonly onProgress?: DecodeProgress;
		readonly signal?: AbortSignal;
	} = {},
): Promise<DecodedAudio> {
	const track = await resolveTrack(opened, options.trackId);
	const sink = new AudioBufferSink(track);
	const duration = opened.probe.durationSec;
	const chunks: AudioBuffer[] = [];

	try {
		for await (const wrapped of sink.buffers()) {
			if (options.signal?.aborted === true) break;
			chunks.push(wrapped.buffer);
			if (duration > 0) {
				options.onProgress?.(Math.min(1, (wrapped.timestamp + wrapped.duration) / duration));
			}
		}
	} catch (cause) {
		throw new MediaError(
			cause instanceof Error ? cause.message : String(cause),
			"decode",
			track.codec ?? "unknown codec",
		);
	}

	if (chunks.length === 0) {
		throw new MediaError("the audio track decoded to nothing", "decode", track.codec ?? "");
	}

	const buffer = concatenateBuffers(chunks);
	return {
		buffer,
		sampleRate: buffer.sampleRate,
		channels: buffer.numberOfChannels,
		durationSec: buffer.duration,
	};
}

/** Joins decoded chunks into the single buffer playback consumes. */
function concatenateBuffers(chunks: readonly AudioBuffer[]): AudioBuffer {
	const first = chunks[0];
	if (first === undefined) throw new MediaError("nothing to concatenate", "decode");

	const frames = chunks.reduce((total, chunk) => total + chunk.length, 0);
	const context = new OfflineAudioContext(first.numberOfChannels, frames, first.sampleRate);
	const output = context.createBuffer(first.numberOfChannels, frames, first.sampleRate);

	let offset = 0;
	for (const chunk of chunks) {
		for (let channel = 0; channel < output.numberOfChannels; channel++) {
			output.copyToChannel(
				chunk.getChannelData(Math.min(channel, chunk.numberOfChannels - 1)),
				channel,
				offset,
			);
		}
		offset += chunk.length;
	}

	return output;
}

/** Channel views, which is what the loudness and waveform code consumes. */
export function channelsOf(buffer: AudioBuffer): readonly Float32Array[] {
	return Array.from({ length: buffer.numberOfChannels }, (_, index) =>
		buffer.getChannelData(index),
	);
}

/**
 * Streams the whole track to compute waveform peaks, keeping nothing.
 *
 * One hour of stereo 48 kHz float32 is about 1.4 GB, so the decoded buffers
 * cannot be retained. Peaks are folded in as each chunk arrives and the chunk
 * is dropped, which makes the memory cost independent of duration.
 */
export async function computeTrackPeaks(
	opened: OpenedInput,
	bucketCount: number,
	options: {
		readonly trackId?: number;
		readonly onProgress?: DecodeProgress;
		readonly signal?: AbortSignal;
	} = {},
): Promise<WaveformPeaks> {
	const track = await resolveTrack(opened, options.trackId);
	const sink = new AudioBufferSink(track);
	const duration = opened.probe.durationSec;

	const peaks = new Float32Array(bucketCount * 2);
	const rms = new Float32Array(bucketCount);
	const counts = new Uint32Array(bucketCount);

	for await (const wrapped of sink.buffers()) {
		if (options.signal?.aborted === true) break;
		const chunk = wrapped.buffer;
		const frames = chunk.length;
		const channels = channelsOf(chunk);

		for (let frame = 0; frame < frames; frame++) {
			const timestamp = wrapped.timestamp + frame / chunk.sampleRate;
			const bucket = Math.min(
				bucketCount - 1,
				Math.max(0, Math.floor((timestamp / Math.max(duration, 1e-6)) * bucketCount)),
			);

			let value = 0;
			for (const channel of channels) value += channel[frame] ?? 0;
			value /= channels.length;

			const minIndex = bucket * 2;
			if (counts[bucket] === 0) {
				peaks[minIndex] = value;
				peaks[minIndex + 1] = value;
			} else {
				peaks[minIndex] = Math.min(peaks[minIndex] ?? 0, value);
				peaks[minIndex + 1] = Math.max(peaks[minIndex + 1] ?? 0, value);
			}
			rms[bucket] = (rms[bucket] ?? 0) + value * value;
			counts[bucket] = (counts[bucket] ?? 0) + 1;
		}

		if (duration > 0) {
			options.onProgress?.(Math.min(1, (wrapped.timestamp + wrapped.duration) / duration));
		}
	}

	for (let bucket = 0; bucket < bucketCount; bucket++) {
		const count = counts[bucket] ?? 0;
		rms[bucket] = count === 0 ? 0 : Math.sqrt((rms[bucket] ?? 0) / count);
	}

	return { peaks, rms, bucketCount, durationSec: duration };
}

/**
 * Reads a window of audio around a timestamp.
 *
 * Playback schedules one window at a time, so seeking a one-hour file costs the
 * decode of a few seconds rather than of the whole programme.
 */
export type AudioWindowReader = {
	readonly read: (startSec: number, endSec: number) => Promise<AudioBuffer | null>;
	readonly sampleRate: number;
	readonly channels: number;
};

export async function createAudioWindowReader(
	opened: OpenedInput,
	trackId?: number,
): Promise<AudioWindowReader> {
	const track = await resolveTrack(opened, trackId);
	const sink = new AudioBufferSink(track);

	return {
		sampleRate: track.sampleRate,
		channels: track.numberOfChannels,
		read: async (startSec, endSec) => {
			const chunks: AudioBuffer[] = [];
			// `buffers(start, end)` decodes only the range asked for, which is
			// the whole reason this reader exists.
			for await (const wrapped of sink.buffers(startSec, endSec)) {
				chunks.push(wrapped.buffer);
			}
			return chunks.length === 0 ? null : concatenateBuffers(chunks);
		},
	};
}

/** Bytes a full decode would take, so the editor can decide before doing it. */
export function estimateDecodedBytes(
	durationSec: number,
	sampleRate: number,
	channels: number,
): number {
	return Math.round(durationSec * sampleRate * channels * 4);
}

/** Above this, a full decode is refused and the windowed reader is used. */
export const FULL_DECODE_CEILING_BYTES = 512 * 1024 * 1024;
