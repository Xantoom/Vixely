import type { FilterParams } from '@/modules/shared-core/types/filters.ts';

/**
 * Build a CSS/canvas2D-compatible filter string for environments where WebGL rendering is unavailable.
 * This is an approximation and does not cover highlights/shadows/temperature/tint/vignette/grain.
 */
export function buildFallbackFilterString(filters: FilterParams): string {
	const parts: string[] = [];
	const brightness = Math.max(0, filters.exposure * (1 + filters.brightness));
	if (Math.abs(brightness - 1) > 0.01) parts.push(`brightness(${brightness.toFixed(3)})`);
	if (Math.abs(filters.contrast - 1) > 0.01) parts.push(`contrast(${filters.contrast.toFixed(3)})`);
	if (Math.abs(filters.saturation - 1) > 0.01) parts.push(`saturate(${filters.saturation.toFixed(3)})`);
	if (Math.abs(filters.hue) > 0.5) parts.push(`hue-rotate(${filters.hue.toFixed(1)}deg)`);
	if (filters.sepia > 0.01) parts.push(`sepia(${filters.sepia.toFixed(3)})`);
	if (filters.blur > 0.1) parts.push(`blur(${filters.blur.toFixed(2)}px)`);
	return parts.length > 0 ? parts.join(' ') : 'none';
}
