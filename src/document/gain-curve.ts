/** A point of a volume curve: linear amplitude at an output time. Straight lines join the points. */
export interface GainPoint {
	time: number;
	gain: number;
}

/** Gain at an output time, read from the curve. Before the first point and after the last, it holds. */
export function gainAt(points: readonly GainPoint[], time: number): number {
	const next = points.findIndex((point) => point.time >= time);
	if (next === -1) return points.at(-1)?.gain ?? 1;
	const after = points[next];
	const before = points[next - 1];
	if (!after) return 1;
	if (!before || after.time === before.time) return after.gain;
	return before.gain + ((after.gain - before.gain) * (time - before.time)) / (after.time - before.time);
}
