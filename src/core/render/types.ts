import type { CropRegion, FilterParams, Rotation, TextLayer } from "../document/types.ts";

/** Anything that can feed the graph: a decoded image today, a VideoFrame later. */
export type FrameSource =
	| { readonly kind: "bitmap"; readonly bitmap: ImageBitmap }
	| { readonly kind: "canvas"; readonly canvas: HTMLCanvasElement | OffscreenCanvas }
	| { readonly kind: "frame"; readonly frame: VideoFrame };

export type RenderTarget =
	| { readonly kind: "screen" }
	| { readonly kind: "offscreen"; readonly width: number; readonly height: number };

/**
 * The complete description of one render. Preview and export build this from
 * the same document and hand it to the same graph — only `target` differs (I1).
 */
export type RenderSpec = {
	readonly source: FrameSource;
	readonly sourceWidth: number;
	readonly sourceHeight: number;
	readonly crop: CropRegion | null;
	readonly rotation: Rotation;
	readonly flipHorizontal: boolean;
	readonly flipVertical: boolean;
	readonly resize: { readonly width: number; readonly height: number } | null;
	readonly filters: FilterParams;
	readonly textLayers: readonly TextLayer[];
	/** Rendered subtitles, entering as a texture through the [subs] pass. */
	readonly overlay: FrameSource | null;
	/** Neutralises the colour pass without changing the pipeline (compare mode). */
	readonly bypassFilters: boolean;
};

export type OutputSize = { readonly width: number; readonly height: number };

export class RenderError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "RenderError";
	}
}
