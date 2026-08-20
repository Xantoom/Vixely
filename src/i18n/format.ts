import type { Locale } from "./types.ts";

/** Interpolates `{name}` placeholders. Missing values are left visible on
 * purpose: a silent empty string hides a bug, `{name}` does not. */
export function interpolate(
	template: string,
	values: Record<string, string | number> | undefined,
): string {
	if (values === undefined) return template;
	return template.replaceAll(/\{(\w+)\}/g, (match, name: string) => {
		const value = values[name];
		return value === undefined ? match : String(value);
	});
}

/** All formatting goes through `Intl`; no formatting library is bundled. */
export function formatBytes(locale: Locale, bytes: number): string {
	const units = ["byte", "kilobyte", "megabyte", "gigabyte", "terabyte"] as const;
	let value = bytes;
	let unitIndex = 0;
	while (Math.abs(value) >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}
	return new Intl.NumberFormat(locale, {
		style: "unit",
		unit: units[unitIndex],
		unitDisplay: "short",
		maximumFractionDigits: unitIndex === 0 ? 0 : 1,
	}).format(value);
}

export function formatPercent(locale: Locale, ratio: number): string {
	return new Intl.NumberFormat(locale, {
		style: "percent",
		maximumFractionDigits: 0,
	}).format(ratio);
}

export function formatNumber(locale: Locale, value: number, fractionDigits = 0): string {
	return new Intl.NumberFormat(locale, {
		minimumFractionDigits: fractionDigits,
		maximumFractionDigits: fractionDigits,
	}).format(value);
}

/**
 * `h:mm:ss.mmm`, trimmed to the largest non-zero unit. Timecodes are not
 * locale-formatted: they are read against the media, not against prose.
 */
function pad(value: number, width = 2): string {
	return String(value).padStart(width, "0");
}

export function formatTimecode(seconds: number, showMilliseconds = false): string {
	const sign = seconds < 0 ? "-" : "";
	const total = Math.abs(seconds);
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const secs = Math.floor(total % 60);
	const millis = Math.round((total % 1) * 1000);

	const base = hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${pad(minutes)}:${pad(secs)}`;
	return showMilliseconds ? `${sign}${base}.${pad(millis, 3)}` : `${sign}${base}`;
}

export function formatDuration(locale: Locale, seconds: number): string {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = Math.round(seconds % 60);
	const parts: string[] = [];
	if (hours > 0) parts.push(`${hours}h`);
	if (minutes > 0) parts.push(`${minutes}m`);
	if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
	return new Intl.ListFormat(locale, { style: "narrow", type: "unit" }).format(parts);
}

/** Picks the best supported locale from `navigator.languages` (OS setting). */
export function negotiateLocale<L extends string>(
	preferred: readonly string[],
	supported: readonly L[],
	fallback: L,
): L {
	for (const candidate of preferred) {
		const exact = supported.find((locale) => locale === candidate.toLowerCase());
		if (exact !== undefined) return exact;
		const base = candidate.toLowerCase().split("-")[0];
		const partial = supported.find((locale) => locale === base);
		if (partial !== undefined) return partial;
	}
	return fallback;
}

/**
 * Translates a command label. Command labels are values built at runtime, so
 * their key is a plain string and their interpolation values cannot be checked
 * statically — this is the one place the typed boundary is crossed, and it is
 * crossed here rather than at every call site.
 */
export function translateLabel(
	translate: (key: never, values: Record<string, string | number>) => string,
	label: { readonly key: string; readonly values?: Readonly<Record<string, string | number>> },
): string {
	return translate(label.key as never, { ...label.values });
}
