/**
 * Undo history for an editing document.
 *
 * Every editor keeps its edits as a document: the untouched source plus the state built from it.
 * The preview and the export both read the same document, which is what guarantees that an export
 * matches what the user saw. Documents are immutable values; this history stores them, so undo is
 * a matter of stepping back to a previous value.
 */
export interface History<T> {
	readonly past: readonly T[];
	readonly present: T;
	readonly future: readonly T[];
}

/** Past states kept in memory. Documents are small (edits, not pixels), so this is generous. */
export const HISTORY_LIMIT = 200;

export function createHistory<T>(initial: T): History<T> {
	return { past: [], present: initial, future: [] };
}

/** Records a new state. A change that produces the same value is not an undo step. */
export function commit<T>(history: History<T>, next: T): History<T> {
	if (Object.is(next, history.present)) return history;
	const past = [...history.past, history.present].slice(-HISTORY_LIMIT);
	return { past, present: next, future: [] };
}

/**
 * Replaces the present state without adding an undo step. Used while a gesture is in progress
 * (dragging a trim handle), so the whole drag becomes one step when it ends with `commit`.
 */
export function replace<T>(history: History<T>, next: T): History<T> {
	return { ...history, present: next };
}

export function undo<T>(history: History<T>): History<T> {
	const previous = history.past.at(-1);
	if (previous === undefined) return history;
	return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
}

export function redo<T>(history: History<T>): History<T> {
	const [next, ...rest] = history.future;
	if (next === undefined) return history;
	return { past: [...history.past, history.present], present: next, future: rest };
}

export function canUndo(history: History<unknown>): boolean {
	return history.past.length > 0;
}

export function canRedo(history: History<unknown>): boolean {
	return history.future.length > 0;
}
