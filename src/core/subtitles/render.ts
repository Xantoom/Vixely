import type { AssStyle, SubtitleCue } from "../document/types.ts";
import { assColourToCss, stripAssTags } from "./ass.ts";

/**
 * Draws cues into a canvas that enters the render graph as a texture.
 *
 * Rendering into the graph rather than layering a canvas over it in CSS is the
 * whole point: an overlay would be a second render path for the same visual
 * result, which is structurally the bug the previous iteration shipped with
 * filters. Preview and burn-in therefore use this identically — only the
 * decision to include the pass differs.
 *
 * This is the built-in renderer. jassub replaces it for full ASS fidelity
 * (transforms, karaoke, drawings); everything here is what works without a
 * 2 MB WASM download for a file that only needs plain text.
 */

export type SubtitleRenderOptions = {
	readonly width: number;
	readonly height: number;
	/** The resolution the script was authored against, for scaling. */
	readonly playResX: number;
	readonly playResY: number;
	readonly styles: readonly AssStyle[];
};

export function cuesAt(cues: readonly SubtitleCue[], timeMs: number): readonly SubtitleCue[] {
	return cues.filter((cue) => timeMs >= cue.startMs && timeMs < cue.endMs);
}

export function renderCues(
	cues: readonly SubtitleCue[],
	options: SubtitleRenderOptions,
	target?: OffscreenCanvas,
): OffscreenCanvas | null {
	if (cues.length === 0) return null;

	const canvas = target ?? new OffscreenCanvas(options.width, options.height);
	if (canvas.width !== options.width || canvas.height !== options.height) {
		canvas.width = options.width;
		canvas.height = options.height;
	}

	const context = canvas.getContext("2d");
	if (context === null) return null;
	context.clearRect(0, 0, options.width, options.height);

	// Styles are authored against PlayResX/Y; the picture is rarely that size.
	const scale = options.height / Math.max(1, options.playResY);

	// Layer order is what ASS uses to keep a sign above the dialogue.
	const ordered = cues.toSorted((a, b) => a.layer - b.layer);
	let stackedFromBottom = 0;

	for (const cue of ordered) {
		const style =
			options.styles.find((candidate) => candidate.name === cue.styleName) ??
			options.styles[0] ??
			null;

		const fontSize = (style?.fontSize ?? 48) * scale;
		const fontFamily = style?.fontName ?? "Inter, sans-serif";
		const weight = style?.bold === true ? 700 : 400;
		const italic = style?.italic === true ? "italic " : "";

		context.font = `${italic}${weight} ${fontSize}px ${fontFamily}`;
		context.textAlign = "center";
		context.textBaseline = "bottom";

		const lines = stripAssTags(cue.text)
			.split("\n")
			.filter((line) => line.length > 0);
		if (lines.length === 0) continue;

		const lineHeight = fontSize * 1.2;
		const marginV = (cue.marginVertical ?? style?.marginV ?? 30) * scale;
		const blockHeight = lines.length * lineHeight;
		const baseY = options.height - marginV - stackedFromBottom;
		stackedFromBottom += blockHeight;

		const fill = assColourToCss(style?.primaryColour ?? "&H00FFFFFF");
		const outline = assColourToCss(style?.outlineColour ?? "&H00000000");
		const outlineWidth = Math.max(1, (style?.outline ?? 2) * scale);

		lines.forEach((line, index) => {
			const y = baseY - (lines.length - 1 - index) * lineHeight;
			const x = options.width / 2;

			if (outlineWidth > 0) {
				context.lineWidth = outlineWidth * 2;
				context.strokeStyle = outline;
				context.lineJoin = "round";
				context.strokeText(line, x, y);
			}
			context.fillStyle = fill;
			context.fillText(line, x, y);
		});
	}

	return canvas;
}

/**
 * A PGS display set drawn to a canvas.
 *
 * PGS is already pixels, so nothing is laid out: the decoded bitmap is scaled
 * to the picture and composited as it is.
 */
export function renderPgsBitmap(
	pixels: Uint8ClampedArray,
	sourceWidth: number,
	sourceHeight: number,
	targetWidth: number,
	targetHeight: number,
	target?: OffscreenCanvas,
): OffscreenCanvas | null {
	const canvas = target ?? new OffscreenCanvas(targetWidth, targetHeight);
	canvas.width = targetWidth;
	canvas.height = targetHeight;

	const context = canvas.getContext("2d");
	if (context === null) return null;
	context.clearRect(0, 0, targetWidth, targetHeight);

	const source = new OffscreenCanvas(sourceWidth, sourceHeight);
	const sourceContext = source.getContext("2d");
	if (sourceContext === null) return null;
	sourceContext.putImageData(
		new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, sourceWidth, sourceHeight),
		0,
		0,
	);

	context.drawImage(source, 0, 0, targetWidth, targetHeight);
	return canvas;
}
