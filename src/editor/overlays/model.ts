/**
 * Text and stickers laid over a picture: an image, the frames of a GIF or of a video. Positions
 * and sizes are shares of the output, so they hold whatever the export size and survive crops.
 */

export type FontId = 'geist' | 'anton' | 'bebas' | 'oswald' | 'playfair' | 'pacifico' | 'marker' | 'caveat' | 'mono';

export interface FontInfo {
	id: FontId;
	/** Family as loaded by the page. */
	family: string;
	/** Shown in the font list. */
	label: string;
	/** Whether a bold weight exists; otherwise bold is left to the font's own weight. */
	bold: boolean;
	italic: boolean;
}

export const FONTS: FontInfo[] = [
	{ id: 'geist', family: 'Geist Variable', label: 'Geist', bold: true, italic: false },
	{ id: 'anton', family: 'Anton', label: 'Anton', bold: false, italic: false },
	{ id: 'bebas', family: 'Bebas Neue', label: 'Bebas Neue', bold: false, italic: false },
	{ id: 'oswald', family: 'Oswald Variable', label: 'Oswald', bold: true, italic: false },
	{ id: 'playfair', family: 'Playfair Display Variable', label: 'Playfair Display', bold: true, italic: true },
	{ id: 'pacifico', family: 'Pacifico', label: 'Pacifico', bold: false, italic: false },
	{ id: 'marker', family: 'Permanent Marker', label: 'Permanent Marker', bold: false, italic: false },
	{ id: 'caveat', family: 'Caveat Variable', label: 'Caveat', bold: true, italic: false },
	{ id: 'mono', family: 'Geist Mono Variable', label: 'Geist Mono', bold: true, italic: false },
];

export function fontInfo(id: FontId): FontInfo {
	return FONTS.find((font) => font.id === id) ?? FONTS[0]!;
}

export type ShapeId = 'arrow' | 'circle' | 'square' | 'star' | 'heart' | 'bubble';

export const SHAPES: ShapeId[] = ['arrow', 'circle', 'square', 'star', 'heart', 'bubble'];

interface OverlayBase {
	id: string;
	/** Centre, from 0 to 1 across the output. */
	x: number;
	y: number;
	/** Height of a line of text, or of a sticker, as a share of the output's shorter side. */
	size: number;
	/** Degrees, clockwise. */
	rotation: number;
	/** 0 to 1. */
	opacity: number;
	/** When it shows over a video, in seconds of the source; absent for the whole video. */
	span?: { start: number; end: number } | null;
}

export interface TextOverlay extends OverlayBase {
	kind: 'text';
	text: string;
	font: FontId;
	color: string;
	bold: boolean;
	italic: boolean;
	align: 'left' | 'center' | 'right';
	/** Width of the outline as a share of the text's size; 0 for none. */
	outline: number;
	outlineColor: string;
	/** A box behind the text; null for none. */
	background: string | null;
	shadow: boolean;
}

export interface StickerOverlay extends OverlayBase {
	kind: 'sticker';
	/** File name of an emoji in /stickers, without its extension. */
	emoji: string;
}

export interface ShapeOverlay extends OverlayBase {
	kind: 'shape';
	shape: ShapeId;
	color: string;
	/** Only the outline is drawn, as a frame or a ring. */
	outlined: boolean;
}

export type Overlay = TextOverlay | StickerOverlay | ShapeOverlay;

let counter = 0;
const newId = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`;

export type TextStyleId = 'title' | 'body' | 'meme' | 'caption' | 'handwritten';

export const TEXT_STYLE_IDS: TextStyleId[] = ['title', 'body', 'meme', 'caption', 'handwritten'];

/** Ready-made text styles, the starting points offered by the text panel. */
export const TEXT_STYLES: Record<TextStyleId, Omit<TextOverlay, 'id' | 'kind' | 'text' | 'x' | 'y' | 'rotation'>> = {
	title: {
		font: 'geist',
		size: 0.12,
		color: '#ffffff',
		bold: true,
		italic: false,
		align: 'center',
		outline: 0,
		outlineColor: '#000000',
		background: null,
		shadow: true,
		opacity: 1,
	},
	body: {
		font: 'geist',
		size: 0.06,
		color: '#ffffff',
		bold: false,
		italic: false,
		align: 'center',
		outline: 0,
		outlineColor: '#000000',
		background: null,
		shadow: true,
		opacity: 1,
	},
	meme: {
		font: 'anton',
		size: 0.11,
		color: '#ffffff',
		bold: false,
		italic: false,
		align: 'center',
		outline: 0.14,
		outlineColor: '#000000',
		background: null,
		shadow: false,
		opacity: 1,
	},
	caption: {
		font: 'geist',
		size: 0.06,
		color: '#ffffff',
		bold: true,
		italic: false,
		align: 'center',
		outline: 0,
		outlineColor: '#000000',
		background: '#000000b3',
		shadow: false,
		opacity: 1,
	},
	handwritten: {
		font: 'caveat',
		size: 0.11,
		color: '#ffe14d',
		bold: true,
		italic: false,
		align: 'center',
		outline: 0,
		outlineColor: '#000000',
		background: null,
		shadow: true,
		opacity: 1,
	},
};

export function createText(style: TextStyleId, text: string, y = 0.5): TextOverlay {
	return { id: newId(), kind: 'text', text, x: 0.5, y, rotation: 0, ...TEXT_STYLES[style] };
}

export function createSticker(emoji: string): StickerOverlay {
	return { id: newId(), kind: 'sticker', emoji, x: 0.5, y: 0.5, size: 0.25, rotation: 0, opacity: 1 };
}

export function createShape(shape: ShapeId, color: string): ShapeOverlay {
	return {
		id: newId(),
		kind: 'shape',
		shape,
		color,
		outlined: shape === 'circle' || shape === 'square',
		x: 0.5,
		y: 0.5,
		size: 0.25,
		rotation: 0,
		opacity: 1,
	};
}

/** A copy a little lower and to the right, so both show. */
export function duplicate(overlay: Overlay): Overlay {
	return { ...overlay, id: newId(), x: Math.min(1, overlay.x + 0.04), y: Math.min(1, overlay.y + 0.04) };
}

/** Colours offered in one click, before the full picker. */
export const SWATCHES = [
	'#ffffff',
	'#000000',
	'#ff3b30',
	'#ff9500',
	'#ffe14d',
	'#34c759',
	'#00c7be',
	'#0a84ff',
	'#bf5af2',
	'#ff2d92',
];

/** Whether the overlay shows at `time`, in seconds of the source; always without a time. */
export function shownAt(overlay: Overlay, time: number | undefined): boolean {
	const { span } = overlay;
	return time === undefined || !span || (time >= span.start && time < span.end);
}
