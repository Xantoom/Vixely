import type { FilterParams } from '@/modules/shared-core/types/filters.ts';

export interface FilterSliderDef {
	key: keyof FilterParams;
	label: string;
	min: number;
	max: number;
	step: number;
	format: (v: number) => string;
}

const signed = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}`;
const percent = (v: number) => `${Math.round(v * 100)}%`;

/**
 * The six adjustments we expect 90% of users to touch.
 * Single panel, always visible — keep it short.
 */
export const ESSENTIAL_SLIDERS: FilterSliderDef[] = [
	{
		key: 'exposure',
		label: 'Exposure',
		min: 0.5,
		max: 2,
		step: 0.01,
		format: (v) => `${Math.log2(v).toFixed(2)} EV`,
	},
	{ key: 'contrast', label: 'Contrast', min: 0.5, max: 2, step: 0.01, format: percent },
	{ key: 'saturation', label: 'Saturation', min: 0, max: 2, step: 0.01, format: percent },
	{
		key: 'temperature',
		label: 'Warmth',
		min: -1,
		max: 1,
		step: 0.01,
		format: (v) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}`,
	},
	{ key: 'highlights', label: 'Highlights', min: -1, max: 1, step: 0.01, format: signed },
	{ key: 'shadows', label: 'Shadows', min: -1, max: 1, step: 0.01, format: signed },
];

/**
 * Advanced colour controls — collapsed by default.
 * Tint and Hue are surgical knobs most users never touch.
 */
export const ADVANCED_COLOR_SLIDERS: FilterSliderDef[] = [
	{
		key: 'tint',
		label: 'Tint',
		min: -1,
		max: 1,
		step: 0.01,
		format: (v) => (v < -0.01 ? `G ${Math.round(Math.abs(v) * 100)}` : v > 0.01 ? `M ${Math.round(v * 100)}` : '0'),
	},
	{ key: 'hue', label: 'Hue', min: -180, max: 180, step: 1, format: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}°` },
];

/**
 * Stylistic effects — these aren't really "corrections", they alter the image.
 * Collapsed by default.
 */
export const EFFECT_SLIDERS: FilterSliderDef[] = [
	{ key: 'blur', label: 'Blur', min: 0, max: 20, step: 0.5, format: (v) => `${v.toFixed(1)}px` },
	{ key: 'sepia', label: 'Sepia', min: 0, max: 1, step: 0.01, format: percent },
	{ key: 'vignette', label: 'Vignette', min: 0, max: 1, step: 0.01, format: percent },
	{ key: 'grain', label: 'Grain', min: 0, max: 50, step: 1, format: (v) => `${Math.round(v)}%` },
];

/**
 * Legacy three-section layout kept as aliases so older imports continue to work
 * while the codebase migrates to the new shared AdjustmentPanel.
 *
 * - LIGHT_SLIDERS now contains only the four light/tonal essentials.
 * - COLOR_SLIDERS contains saturation + advanced colour.
 *
 * New code should import ESSENTIAL_SLIDERS / ADVANCED_COLOR_SLIDERS / EFFECT_SLIDERS directly.
 */
export const LIGHT_SLIDERS: FilterSliderDef[] = [
	ESSENTIAL_SLIDERS[0]!,
	ESSENTIAL_SLIDERS[1]!,
	ESSENTIAL_SLIDERS[4]!,
	ESSENTIAL_SLIDERS[5]!,
];

export const COLOR_SLIDERS: FilterSliderDef[] = [
	ESSENTIAL_SLIDERS[2]!,
	ESSENTIAL_SLIDERS[3]!,
	...ADVANCED_COLOR_SLIDERS,
];
