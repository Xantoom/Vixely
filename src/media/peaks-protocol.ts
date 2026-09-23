/** Audio frames summarised by one peak: about 3 ms at 44.1 kHz, enough to zoom to a few seconds. */
export const PEAK_FRAMES = 128;

/** Peaks sent back to the page at once, at most. */
export const PEAK_CHUNK = 16_384;

/** Where the track starts and at which rate it decodes. Every worker places frames from these. */
export interface PeaksOrigin {
	/** Source time of the first frame, in seconds. */
	start: number;
	/** Decoded sample rate, in hertz. It can differ from what the container says (HE-AAC doubles it). */
	rate: number;
}

/** Reads frames `fromFrame` to `toFrame` of the track. The first worker finds the origin itself. */
export interface PeaksRequest {
	file: File;
	origin: PeaksOrigin | null;
	fromFrame: number;
	/** Null reads to the end, until a `limit` command says otherwise. */
	toFrame: number | null;
}

/** Sent to the first worker once the others share the rest of the track. */
export interface PeaksLimit {
	type: 'limit';
	toFrame: number;
}

export type PeaksMessage =
	| ({ type: 'start' } & PeaksOrigin)
	/** Minimum and maximum of each peak from `offset`, interleaved, as signed bytes where 127 is full scale. */
	| { type: 'chunk'; offset: number; data: Int8Array }
	| { type: 'done' }
	| { type: 'error' };
