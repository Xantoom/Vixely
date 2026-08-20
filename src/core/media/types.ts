/**
 * The vocabulary the rest of the application uses to talk about media.
 *
 * Nothing outside `core/media` names a Mediabunny type: swapping or upgrading
 * the library must not ripple into five editors (I3).
 */

export type MediaTrackKind = "video" | "audio" | "subtitle";

export type VideoTrackInfo = {
	readonly kind: "video";
	readonly id: number;
	readonly codec: string | null;
	readonly codedWidth: number;
	readonly codedHeight: number;
	readonly displayWidth: number;
	readonly displayHeight: number;
	readonly rotation: number;
	readonly languageCode: string | null;
	readonly name: string | null;
	/** Null when the container does not state one and it was not computed. */
	readonly frameRate: number | null;
	readonly constantFrameRate: boolean | null;
	readonly canDecode: boolean;
};

export type AudioTrackInfo = {
	readonly kind: "audio";
	readonly id: number;
	readonly codec: string | null;
	readonly sampleRate: number;
	readonly channels: number;
	readonly languageCode: string | null;
	readonly name: string | null;
	readonly canDecode: boolean;
};

export type SubtitleTrackInfo = {
	readonly kind: "subtitle";
	readonly id: number;
	/** Container codec id, e.g. `S_TEXT/ASS`. Mediabunny never reports these. */
	readonly codecId: string;
	readonly languageCode: string | null;
	readonly name: string | null;
};

export type MediaTrackInfo = VideoTrackInfo | AudioTrackInfo | SubtitleTrackInfo;

export type MediaProbe = {
	readonly format: string;
	readonly mimeType: string;
	readonly durationSec: number;
	readonly videoTracks: readonly VideoTrackInfo[];
	readonly audioTracks: readonly AudioTrackInfo[];
	/** Always empty from Mediabunny; filled in by core/container for Matroska. */
	readonly subtitleTracks: readonly SubtitleTrackInfo[];
};

export class MediaError extends Error {
	constructor(
		message: string,
		readonly step: "open" | "probe" | "decode" | "encode" | "mux",
		readonly detail?: string,
	) {
		super(message);
		this.name = "MediaError";
	}

	/**
	 * Self-descriptive by design: there is no telemetry, so the message a user
	 * can copy into an issue has to carry the codec, the step and the context.
	 */
	override toString(): string {
		return `${this.name} during ${this.step}: ${this.message}${
			this.detail === undefined ? "" : ` (${this.detail})`
		}`;
	}
}
