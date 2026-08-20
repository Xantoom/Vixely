import { AudioBufferSink, type InputAudioTrack } from "mediabunny";
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
