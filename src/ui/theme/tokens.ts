import {
	bestOn,
	contrastRatio,
	ensureContrast,
	WCAG_AA_NORMAL,
	WCAG_AAA_NORMAL,
	WCAG_NON_TEXT,
} from "./contrast.ts";
import {
	EDITOR_ACCENTS,
	PALETTES,
	SEMANTIC_TOKENS,
	STATUS_TOKENS,
	type EditorAccent,
	type ThemeName,
} from "./palette.ts";

/**
 * Every token used as text or as a meaningful outline is derived so it clears
 * WCAG on the surface it sits on. The derivation runs once, at token
 * generation, and the result is a static stylesheet.
 */
export type ThemeTokens = Readonly<Record<string, string>>;

/** Accent used as text or icon: must clear AA on `--bg` and on `--bg-raised`. */
function accentAsText(accent: string, backgrounds: readonly string[]): string {
	return backgrounds.reduce(
		(color, background) => ensureContrast(color, background, WCAG_AA_NORMAL),
		accent,
	);
}

export function buildThemeTokens(theme: ThemeName): ThemeTokens {
	const palette = PALETTES[theme];
	const tokens: Record<string, string> = {};

	for (const [name, mapping] of Object.entries(SEMANTIC_TOKENS)) {
		tokens[name] = palette[mapping[theme]];
	}

	const bg = tokens["--bg"] as string;
	const raised = tokens["--bg-raised"] as string;
	// Every derivation clears its threshold on the worst surface, not just on
	// the app background — panels and rails are darker or lighter than it.
	const surfaces = [bg, raised, tokens["--bg-sunken"] as string, tokens["--bg-overlay"] as string];
	const against = (color: string, target: number) =>
		surfaces.reduce((current, surface) => ensureContrast(current, surface, target), color);

	tokens["--text"] = against(tokens["--text"] as string, WCAG_AAA_NORMAL);
	tokens["--text-muted"] = against(tokens["--text-muted"] as string, WCAG_AA_NORMAL);
	// AA, not the non-text bar: this token carries real content — timecodes,
	// sizes, format badges — and axe was right to flag it. Genuinely disabled
	// text is dimmed with opacity on top, which is the exempt case.
	tokens["--text-subtle"] = against(tokens["--text-subtle"] as string, WCAG_AA_NORMAL);
	// A separator is decoration, not information: a visible hairline is enough.
	tokens["--border-strong"] = against(tokens["--border-strong"] as string, WCAG_NON_TEXT);

	for (const [name, key] of Object.entries(STATUS_TOKENS)) {
		const base = palette[key];
		tokens[name] = accentAsText(base, surfaces);
		tokens[`${name}-solid`] = ensureContrast(base, palette.base, WCAG_AA_NORMAL);
		tokens[`${name}-on`] = bestOn(tokens[`${name}-solid`] as string, palette.base, palette.crust);
		// Tinted background for banners: keep it close to the surface it sits on.
		tokens[`${name}-surface`] = mixHex(base, raised, theme === "light" ? 0.86 : 0.82);
	}

	for (const [editor, key] of Object.entries(EDITOR_ACCENTS)) {
		const base = palette[key];
		const asText = accentAsText(base, surfaces);
		const solid = ensureContrast(base, palette.base, WCAG_AA_NORMAL);
		tokens[`--accent-${editor}`] = asText;
		tokens[`--accent-${editor}-solid`] = solid;
		tokens[`--accent-${editor}-on`] = bestOn(solid, palette.base, palette.crust);
		tokens[`--accent-${editor}-surface`] = mixHex(base, raised, theme === "light" ? 0.86 : 0.82);
	}

	// Default accent before any editor sets `data-editor`.
	const fallback: EditorAccent = "video";
	tokens["--accent"] = tokens[`--accent-${fallback}`] as string;
	tokens["--accent-solid"] = tokens[`--accent-${fallback}-solid`] as string;
	tokens["--accent-on"] = tokens[`--accent-${fallback}-on`] as string;
	tokens["--accent-surface"] = tokens[`--accent-${fallback}-surface`] as string;
	tokens["--focus-ring"] = ensureContrast(tokens["--accent"] as string, bg, WCAG_NON_TEXT);

	return tokens;
}

function parseChannels(hex: string) {
	return {
		r: Number.parseInt(hex.slice(1, 3), 16),
		g: Number.parseInt(hex.slice(3, 5), 16),
		b: Number.parseInt(hex.slice(5, 7), 16),
	};
}

function mixChannel(from: number, to: number, amount: number): string {
	return Math.round(from + (to - from) * amount)
		.toString(16)
		.padStart(2, "0");
}

/** Blends an accent towards a surface, for tinted banner backgrounds. */
function mixHex(color: string, towards: string, amount: number): string {
	const a = parseChannels(color);
	const b = parseChannels(towards);
	return `#${mixChannel(a.r, b.r, amount)}${mixChannel(a.g, b.g, amount)}${mixChannel(a.b, b.b, amount)}`;
}

/** Text/background pairs the contrast test walks. Kept beside the tokens so a
 * new token cannot be added without declaring how it is meant to be used. */
export const CONTRAST_CONTRACT = {
	/** Body copy: AAA on the primary surface, AA everywhere else. */
	bodyText: ["--text"],
	secondaryText: ["--text-muted"],
	/** Disabled text is exempt from 1.4.3 but still has to be readable. */
	subtleText: ["--text-subtle"],
	accentText: [
		"--accent",
		"--accent-image",
		"--accent-video",
		"--accent-gif",
		"--accent-audio",
		"--accent-subtitles",
		"--danger",
		"--warning",
		"--success",
		"--info",
	],
	surfaces: ["--bg", "--bg-sunken", "--bg-raised", "--bg-overlay"],
	solidPairs: [
		["--accent-solid", "--accent-on"],
		["--accent-image-solid", "--accent-image-on"],
		["--accent-video-solid", "--accent-video-on"],
		["--accent-gif-solid", "--accent-gif-on"],
		["--accent-audio-solid", "--accent-audio-on"],
		["--accent-subtitles-solid", "--accent-subtitles-on"],
		["--danger-solid", "--danger-on"],
		["--warning-solid", "--warning-on"],
		["--success-solid", "--success-on"],
		["--info-solid", "--info-on"],
	],
	nonText: ["--border-strong", "--focus-ring"],
} as const;

export function tokenContrast(tokens: ThemeTokens, foreground: string, background: string): number {
	const fg = tokens[foreground];
	const bg = tokens[background];
	if (fg === undefined || bg === undefined) {
		throw new Error(`unknown token in contrast pair: ${foreground} / ${background}`);
	}
	return contrastRatio(fg, bg);
}
