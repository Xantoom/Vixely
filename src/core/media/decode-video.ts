import { EncodedPacketSink, VideoSampleSink, type InputVideoTrack } from "mediabunny";
import { release, track as trackResource } from "../resources/index.ts";
import { MediaError } from "./types.ts";
import type { OpenedInput } from "./input.ts";

/**
 * Frame-accurate video reading.
 *
 * The preview decodes through Mediabunny rather than through a `<video>`
 * element, and that is not a preference: setting `currentTime` gives no
 * guarantee of landing on a given frame, so frame-accurate editing is
 * unreachable that way. Feeding the graph from the decoder also means the
 * preview and the export start from the same pixels (I1).
 */

export type VideoReader = {
	/** The frame shown at a timestamp. The caller closes it. */
	readonly frameAt: (timeSec: number) => Promise<VideoFrame | null>;
	/** The next frame in presentation order, for stepping. */
	readonly stepFrom: (timeSec: number, direction: 1 | -1) => Promise<VideoFrame | null>;
	/** The keyframe at or before a timestamp, for keyframe-precision seeking. */
	readonly keyframeBefore: (timeSec: number) => Promise<number | null>;
	readonly nextKeyframe: (timeSec: number) => Promise<number | null>;
	readonly frameDurationSec: number;
	readonly width: number;
	readonly height: number;
	readonly dispose: () => void;
};

export async function createVideoReader(
	opened: OpenedInput,
	trackId?: number,
): Promise<VideoReader> {
	const tracks = await opened.input.getVideoTracks();
	const videoTrack =
		trackId === undefined
			? ((await opened.input.getPrimaryVideoTrack()) ?? tracks[0])
			: (tracks.find((candidate) => candidate.id === trackId) ?? tracks[0]);

	if (videoTrack === undefined) {
		throw new MediaError("this file carries no video track", "decode");
	}

	const sink = new VideoSampleSink(videoTrack);
	const packets = new EncodedPacketSink(videoTrack);
	const frameRate = await averageFrameRate(videoTrack);
	const frameDurationSec = frameRate > 0 ? 1 / frameRate : 1 / 25;

	return {
		frameDurationSec,
		width: videoTrack.codedWidth,
		height: videoTrack.codedHeight,

		frameAt: async (timeSec) => {
			const sample = await sink.getSample(Math.max(0, timeSec));
			if (sample === null) return null;
			try {
				// The sample owns its data; the frame is what the graph consumes,
				// and its owner is whoever asked for it (I4).
				return trackResource(sample.toVideoFrame(), "VideoFrame");
			} finally {
				sample.close();
			}
		},

		stepFrom: async (timeSec, direction) => {
			// `getSample` returns the last frame at or before a timestamp, so a
			// step of exactly one frame duration can land back on the frame it
			// started from once floating point is involved. Probing until the
			// timestamp actually changes is what makes a step land on the next
			// frame rather than near it — and near is not frame-accurate.
			const reference = Math.round(timeSec / frameDurationSec);
			let probe = timeSec;

			for (let attempt = 1; attempt <= 8; attempt++) {
				probe = Math.max(0, timeSec + direction * frameDurationSec * attempt * 0.6);
				const sample = await sink.getSample(probe);
				if (sample === null) return null;

				const landed = Math.round(sample.microsecondTimestamp / 1e6 / frameDurationSec);
				if (landed !== reference) {
					try {
						return trackResource(sample.toVideoFrame(), "VideoFrame");
					} finally {
						sample.close();
					}
				}
				sample.close();
				if (probe === 0) return null;
			}

			return null;
		},

		keyframeBefore: async (timeSec) => {
			const packet = await packets.getKeyPacket(Math.max(0, timeSec));
			return packet?.timestamp ?? null;
		},

		nextKeyframe: async (timeSec) => {
			// getKeyPacket looks backwards, so the next one is found by probing
			// forward a frame at a time until the answer changes.
			const current = await packets.getKeyPacket(Math.max(0, timeSec));
			let probe = timeSec + frameDurationSec;
			for (let attempts = 0; attempts < 600; attempts++) {
				const candidate = await packets.getKeyPacket(probe);
				if (candidate !== null && candidate.timestamp > (current?.timestamp ?? -1)) {
					return candidate.timestamp;
				}
				probe += frameDurationSec * 5;
			}
			return null;
		},

		dispose: () => {
			// Nothing to release here: sinks hold no frames of their own, and the
			// input is disposed by whoever opened it.
		},
	};
}

async function averageFrameRate(videoTrack: InputVideoTrack): Promise<number> {
	try {
		const metrics = await videoTrack.computeFrameRateMetrics();
		return metrics.averageFrameRate;
	} catch {
		return 25;
	}
}

/** Closes a frame; kept here so editors never touch the tracker directly. */
export function closeFrame(frame: VideoFrame | null): void {
	release(frame, "VideoFrame");
}
