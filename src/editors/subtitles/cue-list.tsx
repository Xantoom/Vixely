import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import type { SubtitleCue } from "~/core/document";
import { formatTimecode } from "~/i18n/format.ts";
import { cn } from "~/ui/cn.ts";

export type CueListProps = {
	cues: readonly SubtitleCue[];
	selectedId: string | null;
	editable: boolean;
	onSelect: (id: string) => void;
	onChangeText: (id: string, text: string) => void;
	onSeal: () => void;
};

/**
 * The cue table.
 *
 * Virtualised: a feature-length subtitle track runs to a couple of thousand
 * cues, and rendering them all makes typing in one of them stutter.
 */
export function CueList({
	cues,
	selectedId,
	editable,
	onSelect,
	onChangeText,
	onSeal,
}: CueListProps) {
	const containerRef = useRef<HTMLDivElement>(null);

	const virtualizer = useVirtualizer({
		count: cues.length,
		getScrollElement: () => containerRef.current,
		estimateSize: () => 72,
		overscan: 8,
	});

	return (
		<div ref={containerRef} className="h-full overflow-auto">
			<div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
				{virtualizer.getVirtualItems().map((item) => {
					const cue = cues[item.index];
					if (cue === undefined) return null;
					const selected = cue.id === selectedId;

					return (
						<div
							key={cue.id}
							style={{
								position: "absolute",
								top: item.start,
								left: 0,
								width: "100%",
								height: item.size,
							}}
							className={cn(
								"flex gap-3 border-b border-[var(--border)] px-3 py-2",
								selected && "bg-[var(--accent-surface)]",
							)}
						>
							<button
								type="button"
								onClick={() => onSelect(cue.id)}
								className="tabular shrink-0 text-left text-2xs text-[var(--text-muted)]"
							>
								<span className="block">{item.index + 1}</span>
								<span className="block">{formatTimecode(cue.startMs / 1000, true)}</span>
								<span className="block">{formatTimecode(cue.endMs / 1000, true)}</span>
							</button>

							{editable ? (
								<textarea
									value={cue.text}
									onChange={(event) => onChangeText(cue.id, event.target.value)}
									onFocus={() => onSelect(cue.id)}
									onBlur={onSeal}
									aria-label={`Cue ${item.index + 1}`}
									className={cn(
										"h-full flex-1 resize-none rounded-[var(--radius-control)] border border-transparent",
										"bg-transparent px-2 py-1 font-sans text-sm text-[var(--text)]",
										"outline-none hover:border-[var(--border)]",
										"focus:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]",
									)}
								/>
							) : (
								// PGS: the words are pixels, so there is nothing to type into.
								<p className="flex-1 self-center text-sm italic text-[var(--text-subtle)]">image</p>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
