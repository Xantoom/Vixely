declare module 'gifenc' {
	export type QuantizeFormat = 'rgb565' | 'rgb444' | 'rgba4444';

	export interface QuantizeOptions {
		format?: QuantizeFormat;
		oneBitAlpha?: boolean | number;
		clearAlpha?: boolean;
		clearAlphaThreshold?: number;
		clearAlphaColor?: number;
	}

	export type Palette = number[][];

	export function quantize(
		rgba: Uint8Array | Uint8ClampedArray,
		maxColors: number,
		options?: QuantizeOptions,
	): Palette;

	export function applyPalette(
		rgba: Uint8Array | Uint8ClampedArray,
		palette: Palette,
		format?: QuantizeFormat,
	): Uint8Array;

	export interface FrameOptions {
		palette?: Palette;
		first?: boolean;
		transparent?: boolean;
		transparentIndex?: number;
		/** Frame delay in milliseconds. */
		delay?: number;
		/** Loop count: -1 = play once, 0 = forever, N = play N+1 times. Set on first frame only. */
		repeat?: number;
		/** GIF dispose flag. -1 = default. */
		dispose?: number;
	}

	export interface GIFEncoderInstance {
		writeFrame(indexedPixels: Uint8Array, width: number, height: number, options?: FrameOptions): void;
		finish(): void;
		bytes(): Uint8Array;
		bytesView(): Uint8Array;
		reset(): void;
	}

	export interface GIFEncoderOptions {
		/** Auto-write GIF header on first frame. Default true. */
		auto?: boolean;
		/** Initial buffer size in bytes. Default 4096. */
		initialCapacity?: number;
	}

	export function GIFEncoder(opts?: GIFEncoderOptions): GIFEncoderInstance;
}
