import { describe, expect, it } from "vitest";
import {
	canRedo,
	canUndo,
	createHistory,
	execute,
	redo,
	redoLabel,
	sealMerge,
	undo,
	undoLabel,
	type Command,
	type HistoryOptions,
} from "~/core/history";

type Toy = { readonly value: number; readonly note: string };

const START: Toy = { value: 0, note: "" };

function set(value: number, mergeKey?: string): Command<Toy> {
	return {
		label: { key: "command.filter", values: { name: String(value) } },
		apply: (document) => ({ ...document, value }),
		...(mergeKey === undefined ? {} : { mergeKey }),
	};
}

function clock(start = 1000) {
	let now = start;
	return {
		options: (overrides: Partial<HistoryOptions> = {}): HistoryOptions => ({
			limit: 200,
			mergeWindowMs: 600,
			now: () => now,
			...overrides,
		}),
		advance: (ms: number) => {
			now += ms;
		},
	};
}

describe("command bus (I2)", () => {
	it("applies a command and records it", () => {
		const state = execute(createHistory(START), set(5));
		expect(state.present.value).toBe(5);
		expect(canUndo(state)).toBe(true);
		expect(canRedo(state)).toBe(false);
	});

	it("undoes back to the exact previous value", () => {
		let state = execute(createHistory(START), set(5));
		state = execute(state, set(9));
		state = undo(state);
		expect(state.present.value).toBe(5);
		state = undo(state);
		expect(state.present).toEqual(START);
		expect(canUndo(state)).toBe(false);
	});

	it("redoes what was undone", () => {
		let state = execute(createHistory(START), set(5));
		state = redo(undo(state));
		expect(state.present.value).toBe(5);
		expect(canRedo(state)).toBe(false);
	});

	it("drops the redo stack once a new command lands", () => {
		let state = execute(createHistory(START), set(5));
		state = undo(state);
		expect(canRedo(state)).toBe(true);
		state = execute(state, set(7));
		expect(canRedo(state)).toBe(false);
		expect(state.present.value).toBe(7);
	});

	it("is a no-op when there is nothing to undo or redo", () => {
		const state = createHistory(START);
		expect(undo(state)).toBe(state);
		expect(redo(state)).toBe(state);
	});

	it("exposes the labels shown in the menu", () => {
		const state = execute(createHistory(START), set(3));
		expect(undoLabel(state)?.values).toEqual({ name: "3" });
		expect(redoLabel(undo(state))?.values).toEqual({ name: "3" });
	});
});

describe("gesture merging", () => {
	it("collapses a slider drag into one entry", () => {
		const time = clock();
		let state = createHistory(START);
		for (let value = 1; value <= 40; value++) {
			state = execute(state, set(value, "filter:contrast"), time.options());
			time.advance(10);
		}
		expect(state.past).toHaveLength(1);
		expect(state.present.value).toBe(40);
		// One undo must return to before the whole gesture, not to step 39.
		expect(undo(state).present).toEqual(START);
	});

	it("starts a new entry once the merge window lapses", () => {
		const time = clock();
		let state = execute(createHistory(START), set(1, "filter:contrast"), time.options());
		time.advance(700);
		state = execute(state, set(2, "filter:contrast"), time.options());
		expect(state.past).toHaveLength(2);
	});

	it("does not merge different controls", () => {
		const time = clock();
		let state = execute(createHistory(START), set(1, "filter:contrast"), time.options());
		state = execute(state, set(2, "filter:gamma"), time.options());
		expect(state.past).toHaveLength(2);
	});

	it("never merges commands without a merge key", () => {
		const time = clock();
		let state = execute(createHistory(START), set(1), time.options());
		state = execute(state, set(2), time.options());
		expect(state.past).toHaveLength(2);
	});

	it("sealing ends the run so the next command is separate", () => {
		const time = clock();
		let state = execute(createHistory(START), set(1, "filter:contrast"), time.options());
		state = sealMerge(state);
		state = execute(state, set(2, "filter:contrast"), time.options());
		expect(state.past).toHaveLength(2);
	});
});

describe("bounded history", () => {
	it("evicts the oldest entries past the cap", () => {
		const time = clock();
		const options = time.options({ limit: 10 });
		let state = createHistory(START);
		for (let value = 1; value <= 25; value++) {
			state = execute(state, set(value), options);
		}
		expect(state.past).toHaveLength(10);
		// The oldest reachable state is the one 10 commands back, not START.
		expect(state.past[0]?.before.value).toBe(15);
	});
});
