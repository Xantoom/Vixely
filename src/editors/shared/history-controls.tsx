import type { CommandLabel } from "~/core/history";
import { translateLabel } from "~/i18n/format.ts";
import { IconButton } from "~/ui/primitives/icon-button.tsx";
import { useTranslate } from "~/ui/hooks/use-translate.ts";

export type HistoryControlsProps = {
	canUndo: boolean;
	canRedo: boolean;
	undoLabel: CommandLabel | undefined;
	redoLabel: CommandLabel | undefined;
	onUndo: () => void;
	onRedo: () => void;
};

/** Undo and redo are global to every editor, so their control is shared too. */
export function HistoryControls({
	canUndo,
	canRedo,
	undoLabel,
	redoLabel,
	onUndo,
	onRedo,
}: HistoryControlsProps) {
	const t = useTranslate();
	const describe = (label: CommandLabel | undefined) =>
		label === undefined ? undefined : translateLabel(t, label);

	const undoText = describe(undoLabel);
	const redoText = describe(redoLabel);

	return (
		<div className="flex items-center gap-0.5">
			<IconButton
				label={
					undoText === undefined ? t("action.undo") : t("action.undoAction", { action: undoText })
				}
				isDisabled={!canUndo}
				onPress={onUndo}
				size="sm"
			>
				<svg
					aria-hidden
					width="14"
					height="14"
					viewBox="0 0 16 16"
					className="fill-none stroke-current stroke-[1.4]"
				>
					<path d="M3 8h7a3 3 0 0 1 0 6H7" strokeLinecap="round" />
					<path d="M5.5 5.5 3 8l2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			</IconButton>
			<IconButton
				label={
					redoText === undefined ? t("action.redo") : t("action.redoAction", { action: redoText })
				}
				isDisabled={!canRedo}
				onPress={onRedo}
				size="sm"
			>
				<svg
					aria-hidden
					width="14"
					height="14"
					viewBox="0 0 16 16"
					className="fill-none stroke-current stroke-[1.4]"
				>
					<path d="M13 8H6a3 3 0 0 0 0 6h3" strokeLinecap="round" />
					<path d="M10.5 5.5 13 8l-2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			</IconButton>
		</div>
	);
}
