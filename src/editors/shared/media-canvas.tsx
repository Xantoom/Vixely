import { useCallback, useEffect, useRef, useState } from "react";
import { fitScale } from "~/core/render";
import { cn } from "~/ui/cn.ts";
import { IconButton } from "~/ui/primitives/icon-button.tsx";
import { useTranslate } from "~/ui/hooks/use-translate.ts";

export type MediaCanvasProps = {
	/** Intrinsic size of the rendered content, in device pixels. */
	contentWidth: number;
	contentHeight: number;
	/** The canvas element the render graph draws into. */
	children: React.ReactNode;
	/** Text alternative for the working canvas (WCAG 1.1.1). */
	description: string;
	className?: string;
};

const ZOOM_STEPS = [0.05, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 16] as const;

/**
 * Zoom, pan, fit and 1:1 for every editor.
 *
 * `devicePixelRatio` matters here: an editor preview that is soft on a HiDPI
 * screen is unusable, and the ratio changes when a window moves between
 * monitors, so it is watched rather than read once.
 */
export function MediaCanvas({
	contentWidth,
	contentHeight,
	children,
	description,
	className,
}: MediaCanvasProps) {
	const t = useTranslate();
	const viewportRef = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(1);
	const [offset, setOffset] = useState({ x: 0, y: 0 });
	const [panning, setPanning] = useState(false);
	const [autoFit, setAutoFit] = useState(true);

	const fit = useCallback(() => {
		const viewport = viewportRef.current;
		if (viewport === null || contentWidth === 0) return;
		const padding = 32;
		const next = fitScale(
			contentWidth,
			contentHeight,
			viewport.clientWidth - padding,
			viewport.clientHeight - padding,
		);
		setScale(next);
		setOffset({ x: 0, y: 0 });
		setAutoFit(true);
	}, [contentWidth, contentHeight]);

	useEffect(() => {
		if (autoFit) fit();
	}, [autoFit, fit]);

	useEffect(() => {
		const viewport = viewportRef.current;
		if (viewport === null) return;
		const observer = new ResizeObserver(() => {
			if (autoFit) fit();
		});
		observer.observe(viewport);
		return () => observer.disconnect();
	}, [autoFit, fit]);

	const zoomTo = useCallback((next: number) => {
		setScale(Math.min(16, Math.max(0.02, next)));
		setAutoFit(false);
	}, []);

	const stepZoom = useCallback(
		(direction: 1 | -1) => {
			const index = ZOOM_STEPS.findIndex((step) => step > scale + 0.0001);
			const target =
				direction === 1
					? (ZOOM_STEPS[index === -1 ? ZOOM_STEPS.length - 1 : index] ?? 1)
					: (ZOOM_STEPS[Math.max(0, (index === -1 ? ZOOM_STEPS.length : index) - 2)] ?? 1);
			zoomTo(target);
		},
		[scale, zoomTo],
	);

	const handleWheel = useCallback(
		(event: React.WheelEvent) => {
			if (!event.ctrlKey && !event.metaKey) return;
			event.preventDefault();
			zoomTo(scale * (event.deltaY < 0 ? 1.1 : 1 / 1.1));
		},
		[scale, zoomTo],
	);

	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent) => {
			const step = event.shiftKey ? 50 : 10;
			switch (event.key) {
				case "+":
				case "=":
					stepZoom(1);
					break;
				case "-":
					stepZoom(-1);
					break;
				case "0":
					fit();
					break;
				case "1":
					zoomTo(1);
					break;
				case "ArrowLeft":
					setOffset((o) => ({ ...o, x: o.x + step }));
					break;
				case "ArrowRight":
					setOffset((o) => ({ ...o, x: o.x - step }));
					break;
				case "ArrowUp":
					setOffset((o) => ({ ...o, y: o.y + step }));
					break;
				case "ArrowDown":
					setOffset((o) => ({ ...o, y: o.y - step }));
					break;
				default:
					return;
			}
			event.preventDefault();
		},
		[fit, stepZoom, zoomTo],
	);

	return (
		<div className={cn("relative flex h-full w-full flex-col", className)}>
			<div
				ref={viewportRef}
				// An interactive, pannable viewport: `application` is the role that
				// carries keyboard handling, and the description is its accessible name.
				role="application"
				aria-label={description}
				aria-roledescription="Zoomable canvas"
				tabIndex={0}
				onWheel={handleWheel}
				onKeyDown={handleKeyDown}
				onPointerDown={(event) => {
					if (event.button !== 0 && event.button !== 1) return;
					setPanning(true);
					event.currentTarget.setPointerCapture(event.pointerId);
				}}
				onPointerMove={(event) => {
					if (!panning) return;
					setAutoFit(false);
					setOffset((current) => ({
						x: current.x + event.movementX,
						y: current.y + event.movementY,
					}));
				}}
				onPointerUp={(event) => {
					setPanning(false);
					event.currentTarget.releasePointerCapture(event.pointerId);
				}}
				className={cn(
					"relative flex flex-1 items-center justify-center overflow-hidden outline-none",
					"touch-none select-none",
					// A checkerboard so transparency is readable in both themes.
					"bg-[repeating-conic-gradient(var(--bg-sunken)_0%_25%,var(--bg-deep)_0%_50%)] bg-[length:16px_16px]",
					"focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
					panning ? "cursor-grabbing" : "cursor-grab",
				)}
			>
				<div
					style={{
						transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
						transformOrigin: "center",
						width: contentWidth,
						height: contentHeight,
					}}
					className="shadow-[0_0_0_1px_var(--border-strong)] [image-rendering:pixelated]"
				>
					{children}
				</div>
			</div>

			<div className="pointer-events-none absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-[var(--radius-container)] border border-[var(--border)] bg-[var(--bg-overlay)]/95 p-0.5 shadow-[var(--shadow-overlay)] backdrop-blur-sm [&>*]:pointer-events-auto">
				<IconButton label={t("canvas.zoomOut")} size="sm" onPress={() => stepZoom(-1)}>
					<svg
						aria-hidden
						width="14"
						height="14"
						viewBox="0 0 16 16"
						className="fill-none stroke-current stroke-[1.4]"
					>
						<circle cx="7" cy="7" r="4.5" />
						<path d="M10.4 10.4 14 14M5 7h4" strokeLinecap="round" />
					</svg>
				</IconButton>
				<span className="tabular min-w-14 px-1 text-center text-xs text-[var(--text-muted)]">
					{Math.round(scale * 100)}%
				</span>
				<IconButton label={t("canvas.zoomIn")} size="sm" onPress={() => stepZoom(1)}>
					<svg
						aria-hidden
						width="14"
						height="14"
						viewBox="0 0 16 16"
						className="fill-none stroke-current stroke-[1.4]"
					>
						<circle cx="7" cy="7" r="4.5" />
						<path d="M10.4 10.4 14 14M5 7h4M7 5v4" strokeLinecap="round" />
					</svg>
				</IconButton>
				<span aria-hidden className="mx-0.5 h-4 w-px bg-[var(--border)]" />
				<IconButton label={t("canvas.fit")} size="sm" onPress={fit} active={autoFit}>
					<svg
						aria-hidden
						width="14"
						height="14"
						viewBox="0 0 16 16"
						className="fill-none stroke-current stroke-[1.4]"
					>
						<path
							d="M2 5.5V2h3.5M10.5 2H14v3.5M14 10.5V14h-3.5M5.5 14H2v-3.5"
							strokeLinecap="round"
						/>
					</svg>
				</IconButton>
				<IconButton
					label={t("canvas.actualSize")}
					size="sm"
					onPress={() => zoomTo(1)}
					active={Math.abs(scale - 1) < 0.001}
				>
					<span className="tabular text-2xs font-semibold">1:1</span>
				</IconButton>
			</div>
		</div>
	);
}

/** Keeps a canvas backing store aligned with the device pixel ratio. */
export function useDevicePixelRatio(): number {
	const [ratio, setRatio] = useState(() =>
		typeof window === "undefined" ? 1 : window.devicePixelRatio,
	);

	useEffect(() => {
		if (typeof window === "undefined") return;
		let query: MediaQueryList | null = null;
		const listen = () => {
			query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
			query.addEventListener("change", onChange, { once: true });
		};
		const onChange = () => {
			setRatio(window.devicePixelRatio);
			listen();
		};
		listen();
		return () => query?.removeEventListener("change", onChange);
	}, []);

	return ratio;
}
