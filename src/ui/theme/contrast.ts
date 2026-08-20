/** WCAG 2.2 relative luminance and contrast ratio, on sRGB hex colours. */

export type Rgb = { readonly r: number; readonly g: number; readonly b: number };

export function parseHex(hex: string): Rgb {
	const value = hex.replace("#", "");
	const full =
		value.length === 3
			? value
					.split("")
					.map((c) => c + c)
					.join("")
			: value;
	if (!/^[0-9a-f]{6}$/i.test(full)) {
		throw new Error(`invalid hex colour: ${hex}`);
	}
	return {
		r: Number.parseInt(full.slice(0, 2), 16),
		g: Number.parseInt(full.slice(2, 4), 16),
		b: Number.parseInt(full.slice(4, 6), 16),
	};
}

function channelLuminance(channel: number): number {
	const c = channel / 255;
	return c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: string | Rgb): number {
	const { r, g, b } = typeof color === "string" ? parseHex(color) : color;
	return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

export function contrastRatio(foreground: string, background: string): number {
	const a = relativeLuminance(foreground);
	const b = relativeLuminance(background);
	const [light, dark] = a > b ? [a, b] : [b, a];
	return (light + 0.05) / (dark + 0.05);
}

export const WCAG_AA_NORMAL = 4.5;
export const WCAG_AA_LARGE = 3;
export const WCAG_AAA_NORMAL = 7;
/** Non-text contrast (WCAG 2.2 SC 1.4.11): borders, focus rings, icons. */
export const WCAG_NON_TEXT = 3;

export function meetsAa(foreground: string, background: string, large = false): boolean {
	return contrastRatio(foreground, background) >= (large ? WCAG_AA_LARGE : WCAG_AA_NORMAL);
}

function channelHex(channel: number): string {
	return Math.round(Math.min(255, Math.max(0, channel)))
		.toString(16)
		.padStart(2, "0");
}

function toHex({ r, g, b }: Rgb): string {
	return `#${channelHex(r)}${channelHex(g)}${channelHex(b)}`;
}

function mix(a: Rgb, b: Rgb, amount: number): Rgb {
	return {
		r: a.r + (b.r - a.r) * amount,
		g: a.g + (b.g - a.g) * amount,
		b: a.b + (b.b - a.b) * amount,
	};
}

/**
 * Darkens or lightens a colour just enough to clear `target` against
 * `background`, keeping its hue.
 *
 * Catppuccin is not AA-conformant by construction — Latte's accents sit around
 * 3:1 on `base`. Rather than hand-pick off-palette colours, every accent is
 * pushed the minimum distance towards black or white that clears the
 * threshold. Deterministic, so the generated tokens are reproducible.
 */
export function ensureContrast(color: string, background: string, target: number): string {
	if (contrastRatio(color, background) >= target) return color;

	const source = parseHex(color);
	const towardsBlack = relativeLuminance(background) > 0.5;
	const extreme: Rgb = towardsBlack ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };

	let low = 0;
	let high = 1;
	for (let i = 0; i < 24; i++) {
		const mid = (low + high) / 2;
		const candidate = mix(source, extreme, mid);
		if (contrastRatio(toHex(candidate), background) >= target) {
			high = mid;
		} else {
			low = mid;
		}
	}
	return toHex(mix(source, extreme, high));
}

/** Picks whichever of two colours reads better on `background`. */
export function bestOn(background: string, a: string, b: string): string {
	return contrastRatio(a, background) >= contrastRatio(b, background) ? a : b;
}
