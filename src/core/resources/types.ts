/** Anything with an explicit release step. */
export type Closeable = { close: () => void };

export type ResourceKind = "VideoFrame" | "AudioData" | "ImageBitmap" | "other";

export type LeakReport = {
	readonly kind: ResourceKind;
	readonly allocated: number;
	readonly released: number;
	readonly outstanding: number;
};
