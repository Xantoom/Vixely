import { useCallback, useRef, useState } from "react";
import { Button } from "~/ui/primitives/button.tsx";
import { cn } from "~/ui/cn.ts";
import { useTranslate } from "~/ui/hooks/use-translate.ts";

export type DropZoneProps = {
	/** Extensions shown to the user and used to filter the picker. */
	accept: readonly string[];
	onFile: (file: File) => void;
	className?: string;
};

/**
 * The only file entry point. `<input type="file">` is present but visually
 * removed: no native control is ever shown (design system §4).
 */
export function DropZone({ accept, onFile, className }: DropZoneProps) {
	const t = useTranslate();
	const [over, setOver] = useState(false);
	const [rejected, setRejected] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const handleFiles = useCallback(
		(files: FileList | null) => {
			const file = files?.[0];
			if (file === undefined) return;
			const extension = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
			if (!accept.includes(extension)) {
				setRejected(file.name);
				return;
			}
			setRejected(null);
			onFile(file);
		},
		[accept, onFile],
	);

	return (
		<div
			onDragOver={(event) => {
				event.preventDefault();
				setOver(true);
			}}
			onDragLeave={() => setOver(false)}
			onDrop={(event) => {
				event.preventDefault();
				setOver(false);
				handleFiles(event.dataTransfer.files);
			}}
			className={cn(
				"flex flex-col items-center justify-center gap-4 rounded-[var(--radius-container)]",
				"border-2 border-dashed p-10 text-center transition-colors duration-[var(--duration-panel)]",
				over
					? "border-[var(--accent)] bg-[var(--accent-surface)]"
					: "border-[var(--border-strong)] bg-[var(--bg-sunken)]",
				className,
			)}
		>
			<svg
				aria-hidden
				width="32"
				height="32"
				viewBox="0 0 32 32"
				className="fill-none stroke-[var(--text-subtle)] stroke-[1.5]"
			>
				<path d="M16 21V7M11 12l5-5 5 5" strokeLinecap="round" />
				<path d="M5 21v3a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2v-3" />
			</svg>

			<p className="text-sm text-[var(--text-muted)]">{t("dropzone.prompt")}</p>

			<Button variant="secondary" onPress={() => inputRef.current?.click()}>
				{t("dropzone.browse")}
			</Button>

			<p className="tabular text-2xs text-[var(--text-subtle)]">
				{t("dropzone.accepts", { formats: accept.join(" · ") })}
			</p>

			{rejected !== null && (
				<p role="alert" className="text-xs text-[var(--danger)]">
					{t("dropzone.rejected", { name: rejected })}
				</p>
			)}

			<input
				ref={inputRef}
				type="file"
				accept={accept.join(",")}
				onChange={(event) => handleFiles(event.target.files)}
				className="sr-only"
				tabIndex={-1}
				aria-hidden
			/>
		</div>
	);
}
