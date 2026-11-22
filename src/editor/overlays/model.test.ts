import { describe, expect, it } from 'vitest';
import { createDrawing, fitDrawing } from './model';

const output = { width: 1000, height: 500 };

describe('drawings', () => {
	const line = { color: '#ff0000', width: 0.02, points: [0.1, 0.2, 0.5, 0.2] };

	it('fits its box around the line, where it was drawn', () => {
		const drawing = createDrawing([line], output);
		expect(drawing).not.toBeNull();
		if (!drawing) return;
		// 400 px long, 10 px wide: the box is 410 × 10, centred on the line.
		expect(drawing.x).toBeCloseTo(0.3, 6);
		expect(drawing.y).toBeCloseTo(0.2, 6);
		expect(drawing.size * 500).toBeCloseTo(10, 6);
		expect(drawing.aspect).toBeCloseTo(41, 6);
	});

	it('grows around a second line, the first staying where it was', () => {
		const first = createDrawing([line], output);
		if (!first) throw new Error('no drawing');
		const both = fitDrawing(first, [{ ...line, points: [0.1, 0.8, 0.5, 0.8] }], output);
		if (!both) throw new Error('no drawing');
		expect(both.y).toBeCloseTo(0.5, 6);
		expect(both.strokes).toHaveLength(2);
		// The first line's start, back in output shares.
		const height = both.size * 500;
		const [px, py] = [both.strokes[0]?.points[0] ?? 0, both.strokes[0]?.points[1] ?? 0];
		expect((both.x * 1000 + px * height) / 1000).toBeCloseTo(0.1, 6);
		expect((both.y * 500 + py * height) / 500).toBeCloseTo(0.2, 6);
	});

	it('keeps lines added to a turned drawing where they were drawn', () => {
		const first = createDrawing([line], output);
		if (!first) throw new Error('no drawing');
		const turned = { ...first, rotation: 30 };
		const next = fitDrawing(turned, [{ ...line, points: [0.3, 0.6] }], output);
		if (!next) throw new Error('no drawing');
		const dot = next.strokes[1];
		const height = next.size * 500;
		const theta = (30 * Math.PI) / 180;
		const [lx, ly] = [(dot?.points[0] ?? 0) * height, (dot?.points[1] ?? 0) * height];
		const x = next.x * 1000 + lx * Math.cos(theta) - ly * Math.sin(theta);
		const y = next.y * 500 + lx * Math.sin(theta) + ly * Math.cos(theta);
		expect(x / 1000).toBeCloseTo(0.3, 6);
		expect(y / 500).toBeCloseTo(0.6, 6);
	});
});
