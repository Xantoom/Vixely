import {
	ALL_FORMATS,
	BlobSource,
	Input,
	type InputAudioTrack,
	type InputVideoTrack,
} from "mediabunny";
import { MediaError, type AudioTrackInfo, type MediaProbe, type VideoTrackInfo } from "./types.ts";

/**
 * The single door onto Mediabunny's reading side (I3).
 *
 * The rest of the application receives plain data, never a library object, so
 * a Mediabunny upgrade is contained to this folder.
 */
export type OpenedInput = {
	readonly input: Input;
	readonly probe: MediaProbe;
	readonly dispose: () => void;
};

export async function openMedia(file: Blob, name: string): Promise<OpenedInput> {
	const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
	try {
		const probe = await probeInput(input);
		return { input, probe, dispose: () => input.dispose() };
	} catch (cause) {
		input.dispose();
		throw cause instanceof MediaError
			? cause
			: new MediaError(cause instanceof Error ? cause.message : String(cause), "open", name);
	}
}

async function probeInput(input: Input): Promise<MediaProbe> {
	const [format, mimeType, durationSec, videoTracks, audioTracks] = await Promise.all([
		input.getFormat(),
		input.getMimeType(),
		input.computeDuration(),
		input.getVideoTracks(),
		input.getAudioTracks(),
	]);

	return {
		format: format.name,
		mimeType,
		durationSec,
		videoTracks: await Promise.all(videoTracks.map((track) => describeVideoTrack(track))),
		audioTracks: await Promise.all(audioTracks.map((track) => describeAudioTrack(track))),
		// Mediabunny reads no subtitle track at all: core/container fills this
		// in for Matroska. Deliberately empty rather than absent, so the shape
		// does not change the day the backend is swapped.
		subtitleTracks: [],
	};
}

async function describeVideoTrack(track: InputVideoTrack): Promise<VideoTrackInfo> {
	const [canDecode, frameRate] = await Promise.all([
		track.canDecode().catch(() => false),
		track.computeFrameRateMetrics().catch(() => null),
	]);

	return {
		kind: "video",
		id: track.id,
		codec: track.codec,
		codedWidth: track.codedWidth,
		codedHeight: track.codedHeight,
		displayWidth: track.displayWidth,
		displayHeight: track.displayHeight,
		rotation: track.rotation,
		languageCode: normaliseLanguage(track.languageCode),
		name: track.name,
		frameRate: frameRate?.averageFrameRate ?? null,
		constantFrameRate: frameRate?.frameRateIsConstant ?? null,
		canDecode,
	};
}

async function describeAudioTrack(track: InputAudioTrack): Promise<AudioTrackInfo> {
	return {
		kind: "audio",
		id: track.id,
		codec: track.codec,
		sampleRate: track.sampleRate,
		channels: track.numberOfChannels,
		languageCode: normaliseLanguage(track.languageCode),
		name: track.name,
		canDecode: await track.canDecode().catch(() => false),
	};
}

/** Containers write `und` for "unspecified"; the UI should show nothing. */
function normaliseLanguage(code: string | null): string | null {
	return code === null || code === "und" || code === "" ? null : code;
}
