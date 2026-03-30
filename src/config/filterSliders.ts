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

export const LIGHT_SLIDERS: FilterSliderDef[] = [
	{
		key: 'exposure',
		label: 'Exposure',
		min: 0.5,
		max: 2,
		step: 0.01,
		format: (v) => `${Math.log2(v).toFixed(1)} EV`,
	},
	{ key: 'brightness', label: 'Brightness', min: -0.3, max: 0.3, step: 0.01, format: signed },
	{ key: 'contrast', label: 'Contrast', min: 0.5, max: 2, step: 0.01, format: (v) => `${Math.round(v * 100)}%` },
	{ key: 'highlights', label: 'Highlights', min: -1, max: 1, step: 0.01, format: signed },
	{ key: 'shadows', label: 'Shadows', min: -1, max: 1, step: 0.01, format: signed },
];

export const COLOR_SLIDERS: FilterSliderDef[] = [
	{ key: 'saturation', label: 'Saturation', min: 0, max: 2, step: 0.01, format: (v) => `${Math.round(v * 100)}%` },
	{
		key: 'temperature',
		label: 'Temperature',
		min: -1,
		max: 1,
		step: 0.01,
		format: (v) => `${Math.round(6500 + v * 3500)}K`,
	},
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

export const EFFECT_SLIDERS: FilterSliderDef[] = [
	{ key: 'blur', label: 'Blur', min: 0, max: 20, step: 0.5, format: (v) => `${v.toFixed(1)}px` },
	{ key: 'sepia', label: 'Sepia', min: 0, max: 1, step: 0.01, format: (v) => `${Math.round(v * 100)}%` },
	{ key: 'vignette', label: 'Vignette', min: 0, max: 1, step: 0.01, format: (v) => `${Math.round(v * 100)}%` },
	{ key: 'grain', label: 'Grain', min: 0, max: 50, step: 1, format: (v) => `${Math.round(v)}%` },
];
