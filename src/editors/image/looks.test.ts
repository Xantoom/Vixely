import { describe, expect, it } from 'vitest';
import { ADJUSTMENT_IDS, ADJUSTMENT_RANGE, sameAdjustments } from './document';
import { autoAdjustments, lookAdjustments, LOOKS } from './looks';
import { aspectOf, turnedAspect } from './store';

describe('looks', () => {
	it('keeps every look within the sliders’ ranges', () => {
		for (const look of LOOKS) {
			const values = lookAdjustments(look.id, null);
			for (const id of ADJUSTMENT_IDS) {
				const [min, max] = ADJUSTMENT_RANGE[id];
				expect(values[id]).toBeGreaterThanOrEqual(min);
				expect(values[id]).toBeLessThanOrEqual(max);
			}
		}
	});

	it('leaves a well exposed, neutral picture almost alone', () => {
		const values = autoAdjustments({ mean: [0.2, 0.2, 0.2], low: 0.02, high: 0.97, median: 0.18, chroma: 0.3 });
		expect(sameAdjustments(values, lookAdjustments('auto', null))).toBe(true);
	});

	it('brightens a dark picture and warms a blue one', () => {
		const values = autoAdjustments({ mean: [0.02, 0.03, 0.06], low: 0.01, high: 0.5, median: 0.03, chroma: 0.1 });
		expect(values.exposure).toBeGreaterThan(20);
		expect(values.contrast).toBeGreaterThan(0);
		expect(values.temperature).toBeGreaterThan(0);
		expect(values.saturation).toBeGreaterThan(0);
	});
});

describe('aspects', () => {
	it('reduces sizes to their ratio and turns them', () => {
		expect(aspectOf(1080, 1350)).toBe('4:5');
		expect(aspectOf(1500, 500)).toBe('3:1');
		expect(turnedAspect('16:9')).toBe('9:16');
		expect(turnedAspect('851:315')).toBe('315:851');
		expect(turnedAspect('free')).toBe('free');
	});
});
