/** A translation key plus its interpolation values, resolved by the UI layer. */
export type CommandLabel = {
	readonly key: string;
	readonly values?: Readonly<Record<string, string | number>>;
};

/**
 * A command is a pure transformation of a document (I2).
 *
 * `invert` is optional: when absent the stack falls back to the snapshot taken
 * before `apply`, which is always correct because documents are values.
 */
export type Command<D> = {
	readonly label: CommandLabel;
	readonly apply: (document: D) => D;
	readonly invert?: (document: D) => D;
	/** Consecutive commands sharing a key and close in time collapse into one. */
	readonly mergeKey?: string;
};

export type HistoryEntry<D> = {
	readonly label: CommandLabel;
	readonly before: D;
	readonly after: D;
	readonly mergeKey: string | undefined;
	readonly timestamp: number;
};

export type HistoryState<D> = {
	readonly present: D;
	readonly past: readonly HistoryEntry<D>[];
	readonly future: readonly HistoryEntry<D>[];
};

export type HistoryOptions = {
	/** Hard cap on stack depth; oldest entries are evicted first. */
	readonly limit: number;
	/** Two commands with the same mergeKey collapse when closer than this. */
	readonly mergeWindowMs: number;
	readonly now: () => number;
};
