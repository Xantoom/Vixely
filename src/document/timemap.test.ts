import { describe, expect, it } from 'vitest';
import { beyond } from './timemap';

describe('beyond', () => {
	it('keeps what the first ranges cover and the second do not', () => {
		const copied = [
			{ start: 0, end: 12 },
			{ start: 20, end: 32.9 },
			{ start: 40, end: 60 },
		];
		const kept = [
			{ start: 0, end: 12 },
			{ start: 21, end: 33 },
			{ start: 44, end: 60 },
		];
		expect(beyond(copied, kept)).toEqual([
			{ start: 20, end: 21 },
			{ start: 40, end: 44 },
		]);
		expect(beyond(kept, copied)).toEqual([{ start: 32.9, end: 33 }]);
	});

	it('is empty when nothing lies outside', () => {
		expect(beyond([{ start: 2, end: 3 }], [{ start: 0, end: 10 }])).toEqual([]);
	});
});
