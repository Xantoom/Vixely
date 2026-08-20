import { useCallback, useMemo, useState } from "react";
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
	type HistoryState,
} from "~/core/history";

export type DocumentHistory<D> = {
	readonly document: D;
	readonly canUndo: boolean;
	readonly canRedo: boolean;
	readonly undoLabel: ReturnType<typeof undoLabel<D>>;
	readonly redoLabel: ReturnType<typeof redoLabel<D>>;
	readonly run: (command: Command<D>) => void;
	readonly undo: () => void;
	readonly redo: () => void;
	/** Called on pointer-up so the next gesture starts a new history entry. */
	readonly seal: () => void;
	readonly reset: (document: D) => void;
};

/** Thin React binding over the pure command bus; the logic stays in core/. */
export function useDocumentHistory<D>(initial: D): DocumentHistory<D> {
	const [state, setState] = useState<HistoryState<D>>(() => createHistory(initial));

	const run = useCallback((command: Command<D>) => {
		setState((current) => execute(current, command));
	}, []);

	return useMemo(
		() => ({
			document: state.present,
			canUndo: canUndo(state),
			canRedo: canRedo(state),
			undoLabel: undoLabel(state),
			redoLabel: redoLabel(state),
			run,
			undo: () => setState(undo),
			redo: () => setState(redo),
			seal: () => setState(sealMerge),
			reset: (document: D) => setState(createHistory(document)),
		}),
		[state, run],
	);
}
