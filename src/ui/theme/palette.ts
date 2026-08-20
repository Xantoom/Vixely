/**
 * Catppuccin Latte (light) and Macchiato (dark).
 *
 * Raw palette values live here and nowhere else. Components consume semantic
 * tokens, never `blue` or `mauve` directly.
 */
export const CATPPUCCIN_LATTE = {
	base: "#eff1f5",
	mantle: "#e6e9ef",
	crust: "#dce0e8",
	surface0: "#ccd0da",
	surface1: "#bcc0cc",
	surface2: "#acb0be",
	overlay0: "#9ca0b0",
	overlay1: "#8c8fa1",
	overlay2: "#7c7f93",
	subtext0: "#6c6f85",
	subtext1: "#5c5f77",
	text: "#4c4f69",
	blue: "#1e66f5",
	mauve: "#8839ef",
	green: "#40a02b",
	peach: "#fe640b",
	teal: "#179299",
	red: "#d20f39",
	yellow: "#df8e1d",
	sky: "#04a5e5",
	lavender: "#7287fd",
	sapphire: "#209fb5",
	pink: "#ea76cb",
	flamingo: "#dd7878",
	rosewater: "#dc8a78",
	maroon: "#e64553",
} as const;

export const CATPPUCCIN_MACCHIATO = {
	base: "#24273a",
	mantle: "#1e2030",
	crust: "#181926",
	surface0: "#363a4f",
	surface1: "#494d64",
	surface2: "#5b6078",
	overlay0: "#6e738d",
	overlay1: "#8087a2",
	overlay2: "#939ab7",
	subtext0: "#a5adcb",
	subtext1: "#b8c0e0",
	text: "#cad3f5",
	blue: "#8aadf4",
	mauve: "#c6a0f6",
	green: "#a6da95",
	peach: "#f5a97f",
	teal: "#8bd5ca",
	red: "#ed8796",
	yellow: "#eed49f",
	sky: "#91d7e3",
	lavender: "#b7bdf8",
	sapphire: "#7dc4e4",
	pink: "#f5bde6",
	flamingo: "#f0c6c6",
	rosewater: "#f4dbd6",
	maroon: "#ee99a0",
} as const;

export type PaletteName = keyof typeof CATPPUCCIN_LATTE;
export type ThemeName = "light" | "dark";

export const PALETTES: Record<ThemeName, Record<PaletteName, string>> = {
	light: CATPPUCCIN_LATTE,
	dark: CATPPUCCIN_MACCHIATO,
};

export type EditorAccent = "image" | "video" | "gif" | "audio" | "subtitles";

/** One accent per pillar, constant across the whole journey (design system §2). */
export const EDITOR_ACCENTS: Record<EditorAccent, PaletteName> = {
	image: "teal",
	video: "blue",
	gif: "peach",
	audio: "mauve",
	subtitles: "green",
};

/**
 * Semantic tokens. Left side is the CSS custom property, right side the
 * palette entry per theme. Changing a theme touches this table only.
 *
 * Elevation reads differently in the two themes: in Latte a raised surface is
 * *lighter* than the app background, in Macchiato it is lighter too — which is
 * why light maps `--bg` to `mantle` and `--bg-raised` to `base`, instead of
 * walking the surface ramp downwards.
 */
export const SEMANTIC_TOKENS = {
	"--bg": { light: "mantle", dark: "base" },
	"--bg-sunken": { light: "crust", dark: "mantle" },
	"--bg-deep": { light: "crust", dark: "crust" },
	"--bg-raised": { light: "base", dark: "surface0" },
	"--bg-overlay": { light: "base", dark: "surface0" },
	"--bg-hover": { light: "surface0", dark: "surface1" },
	"--bg-active": { light: "surface1", dark: "surface2" },
	"--border": { light: "surface1", dark: "surface1" },
	"--border-strong": { light: "overlay0", dark: "overlay2" },
	"--text": { light: "text", dark: "text" },
	"--text-muted": { light: "subtext1", dark: "subtext0" },
	"--text-subtle": { light: "subtext0", dark: "overlay2" },
} as const satisfies Record<string, Record<ThemeName, PaletteName>>;

/** Status colours, contrast-corrected per theme before they reach the CSS. */
export const STATUS_TOKENS = {
	"--danger": "red",
	"--warning": "yellow",
	"--success": "green",
	"--info": "sapphire",
} as const satisfies Record<string, PaletteName>;

export type SemanticToken = keyof typeof SEMANTIC_TOKENS;
export type StatusToken = keyof typeof STATUS_TOKENS;

export function resolveToken(token: SemanticToken, theme: ThemeName): string {
	return PALETTES[theme][SEMANTIC_TOKENS[token][theme]];
}
