import type { Command, HistoryEntry, HistoryOptions, HistoryState } from "./types.ts";

export const DEFAULT_HISTORY_OPTIONS: HistoryOptions = {
	limit: 200,
	mergeWindowMs: 600,
	now: () => Date.now(),
};

export function createHistory<D>(present: D): HistoryState<D> {
	return { present, past: [], future: [] };
}

function evict<D>(past: readonly HistoryEntry<D>[], limit: number): readonly HistoryEntry<D>[] {
	return past.length <= limit ? past : past.slice(past.length - limit);
}

/**
 * Applies a command and pushes it onto the stack.
 *
 * A dragged slider must not produce forty entries: when the incoming command
 * carries the same `mergeKey` as the last one and lands inside the merge
 * window, the two collapse into a single entry spanning both.
 */
export function execute<D>(
	state: HistoryState<D>,
	command: Command<D>,
	options: HistoryOptions = DEFAULT_HISTORY_OPTIONS,
): HistoryState<D> {
	const before = state.present;
	const after = command.apply(before);
	const timestamp = options.now();
	const last = state.past.at(-1);

	const mergeable =
		last !== undefined &&
		command.mergeKey !== undefined &&
		last.mergeKey === command.mergeKey &&
		timestamp - last.timestamp <= options.mergeWindowMs;

	const entry: HistoryEntry<D> = {
		label: command.label,
		before: mergeable ? last.before : before,
		after,
		mergeKey: command.mergeKey,
		timestamp,
	};

	const past = mergeable ? [...state.past.slice(0, -1), entry] : [...state.past, entry];

	return { present: after, past: evict(past, options.limit), future: [] };
}

export function canUndo<D>(state: HistoryState<D>): boolean {
	return state.past.length > 0;
}

export function canRedo<D>(state: HistoryState<D>): boolean {
	return state.future.length > 0;
}

export function undo<D>(state: HistoryState<D>): HistoryState<D> {
	const entry = state.past.at(-1);
	if (entry === undefined) return state;
	return {
		present: entry.before,
		past: state.past.slice(0, -1),
		future: [entry, ...state.future],
	};
}

export function redo<D>(state: HistoryState<D>): HistoryState<D> {
	const [entry, ...rest] = state.future;
	if (entry === undefined) return state;
	return { present: entry.after, past: [...state.past, entry], future: rest };
}

/** Label of the action undo would revert, for menus and tooltips. */
export function undoLabel<D>(state: HistoryState<D>) {
	return state.past.at(-1)?.label;
}

export function redoLabel<D>(state: HistoryState<D>) {
	return state.future[0]?.label;
}

/**
 * Replaces the present without touching the stacks. Used when a document is
 * reloaded from disk — that is not an undoable edit.
 */
export function reset<D>(present: D): HistoryState<D> {
	return createHistory(present);
}

/** Closes a merge run so the next command starts a fresh entry (pointer up). */
export function sealMerge<D>(state: HistoryState<D>): HistoryState<D> {
	const last = state.past.at(-1);
	if (last === undefined || last.mergeKey === undefined) return state;
	return {
		...state,
		past: [...state.past.slice(0, -1), { ...last, mergeKey: undefined }],
	};
}
