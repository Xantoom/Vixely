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

/**
 * Loudness is measured over blocks this far apart, in seconds. EBU R128 gates 400 ms blocks taken
 * every 100 ms; block k ends at the frame `round((k + 1) * rate / 10)`.
 */
export const LOUDNESS_STEP = 0.1;

export type PeaksMessage =
	| ({ type: 'start' } & PeaksOrigin)
	/** Minimum and maximum of each peak from `offset`, interleaved, as signed bytes where 127 is full scale. */
	| { type: 'chunk'; offset: number; data: Int8Array }
	/**
	 * Consecutive loudness blocks from `index`: momentary loudness of the 400 ms ending with each
	 * block, in LUFS, and the highest true peak within it, as a linear amplitude.
	 */
	| { type: 'loudness'; index: number; momentary: Float32Array; peak: Float32Array }
	| { type: 'done' }
	| { type: 'error' };
