import { DEFAULT_FILTER_PARAMS } from '@/modules/shared-core/types/filters.ts';
import type { FilterParams } from '@/modules/shared-core/types/filters.ts';
import { filterPresetEntries } from './presets.ts';

/**
 * A Look is a named, intensity-scalable colour grade.
 * It maps to a target FilterParams; the runtime blends from the user's base
 * filters toward this target according to `lookIntensity`.
 *
 * Looks are reactive (slidable) — unlike one-shot presets, the user can dial
 * the intensity 0-100% at any time without losing their own slider tweaks.
 */
export interface Look {
	id: string;
	name: string;
	params: FilterParams;
}

const PRESET_ENTRIES = filterPresetEntries();

export const LOOKS: Look[] = PRESET_ENTRIES.filter(([id]) => id !== 'reset').map(([id, preset]) => ({
	id,
	name: preset.name,
	params: {
		exposure: preset.exposure,
		brightness: preset.brightness,
		contrast: preset.contrast,
		highlights: preset.highlights,
		shadows: preset.shadows,
		saturation: preset.saturation,
		temperature: preset.temperature,
		tint: preset.tint,
		hue: preset.hue,
		blur: preset.blur,
		sepia: preset.sepia,
		vignette: preset.vignette,
		grain: preset.grain,
	},
}));

const LOOK_BY_ID = new Map(LOOKS.map((l) => [l.id, l]));

export function findLook(id: string | null): Look | null {
	if (!id) return null;
	return LOOK_BY_ID.get(id) ?? null;
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function clamp01(v: number): number {
	return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Compose the user's base FilterParams with an optional Look at a given intensity.
 *
 * Multiplicative params (exposure, contrast, saturation) compose by chaining factors.
 * Additive params (everything else) compose by summing the look's delta from default.
 * Intensity 0 → identical to base. Intensity 1 → full Look override applied on top.
 */
export function composeFilters(base: FilterParams, lookId: string | null, lookIntensity: number): FilterParams {
	const look = findLook(lookId);
	if (!look) return base;

	const t = clamp01(lookIntensity);
	const D = DEFAULT_FILTER_PARAMS;
	const L = look.params;

	const factor = (b: number, l: number, d: number) => b * lerp(d, l, t);
	const offset = (b: number, l: number, d: number) => b + (lerp(d, l, t) - d);

	return {
		exposure: factor(base.exposure, L.exposure, D.exposure),
		contrast: factor(base.contrast, L.contrast, D.contrast),
		saturation: factor(base.saturation, L.saturation, D.saturation),
		brightness: offset(base.brightness, L.brightness, D.brightness),
		highlights: offset(base.highlights, L.highlights, D.highlights),
		shadows: offset(base.shadows, L.shadows, D.shadows),
		temperature: offset(base.temperature, L.temperature, D.temperature),
		tint: offset(base.tint, L.tint, D.tint),
		hue: offset(base.hue, L.hue, D.hue),
		blur: offset(base.blur, L.blur, D.blur),
		sepia: offset(base.sepia, L.sepia, D.sepia),
		vignette: offset(base.vignette, L.vignette, D.vignette),
		grain: offset(base.grain, L.grain, D.grain),
	};
}
