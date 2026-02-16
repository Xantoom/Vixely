/**
 * Unified filter parameters used across all editors.
 * Superset of image Filters (13 fields) and VideoFilters (4 fields).
 */
export interface FilterParams {
	exposure: number;
	brightness: number;
	contrast: number;
	highlights: number;
	shadows: number;
	saturation: number;
	temperature: number;
	tint: number;
	hue: number;
	blur: number;
	sepia: number;
	vignette: number;
	grain: number;
}

export const DEFAULT_FILTER_PARAMS: Readonly<FilterParams> = {
	exposure: 1,
	brightness: 0,
	contrast: 1,
	highlights: 0,
	shadows: 0,
	saturation: 1,
	temperature: 0,
	tint: 0,
	hue: 0,
	blur: 0,
	sepia: 0,
	vignette: 0,
	grain: 0,
};

export function filtersEqual(a: FilterParams, b: FilterParams): boolean {
	return (
		a.exposure === b.exposure &&
		a.brightness === b.brightness &&
		a.contrast === b.contrast &&
		a.highlights === b.highlights &&
		a.shadows === b.shadows &&
		a.saturation === b.saturation &&
		a.temperature === b.temperature &&
		a.tint === b.tint &&
		a.hue === b.hue &&
		a.blur === b.blur &&
		a.sepia === b.sepia &&
		a.vignette === b.vignette &&
		a.grain === b.grain
	);
}

export function filtersAreDefault(f: FilterParams): boolean {
	return filtersEqual(f, DEFAULT_FILTER_PARAMS);
}
