import { describe, expect, it } from 'vitest';
import { canRedo, canUndo, commit, createHistory, HISTORY_LIMIT, redo, replace, undo } from './history';

interface Trim {
	start: number;
	end: number;
}

describe('history', () => {
	const initial: Trim = { start: 0, end: 64 };

	it('undoes and redoes committed states', () => {
		let h = createHistory(initial);
		h = commit(h, { start: 10, end: 64 });
		h = commit(h, { start: 10, end: 40 });
		expect(h.present).toEqual({ start: 10, end: 40 });

		h = undo(h);
		expect(h.present).toEqual({ start: 10, end: 64 });
		h = undo(h);
		expect(h.present).toBe(initial);
		expect(canUndo(h)).toBe(false);

		h = redo(h);
		expect(h.present).toEqual({ start: 10, end: 64 });
		expect(canRedo(h)).toBe(true);
	});

	it('drops the redo branch on a new commit', () => {
		let h = commit(createHistory(initial), { start: 5, end: 64 });
		h = undo(h);
		h = commit(h, { start: 0, end: 30 });
		expect(canRedo(h)).toBe(false);
	});

	it('ignores commits of the same value', () => {
		const h = createHistory(initial);
		expect(commit(h, initial)).toBe(h);
	});

	it('turns a gesture into a single step', () => {
		let h = createHistory(initial);
		for (const start of [1, 2, 3, 4]) h = replace(h, { start, end: 64 });
		h = commit(replace(h, initial), { start: 4, end: 64 });
		expect(h.past).toHaveLength(1);
		expect(undo(h).present).toBe(initial);
	});

	it('forgets the oldest states beyond the limit', () => {
		let h = createHistory(0);
		for (let i = 1; i <= HISTORY_LIMIT + 10; i += 1) h = commit(h, i);
		expect(h.past).toHaveLength(HISTORY_LIMIT);
		expect(h.past[0]).toBe(10);
	});

	it('does nothing when there is nothing to undo or redo', () => {
		const h = createHistory(initial);
		expect(undo(h)).toBe(h);
		expect(redo(h)).toBe(h);
	});
});
