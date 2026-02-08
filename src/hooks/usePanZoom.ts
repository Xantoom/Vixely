import { useEffect, useRef, useCallback, type RefObject } from "react";
import type { ViewTransform } from "@/stores/imageEditor.ts";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;

interface UsePanZoomOptions {
	containerRef: RefObject<HTMLDivElement | null>;
	view: ViewTransform;
	setView: (v: Partial<ViewTransform>) => void;
	zoomTo: (zoom: number, anchorX: number, anchorY: number) => void;
	enabled: boolean;
	/** Allow left-click drag to pan (true for pointer mode, false for crop) */
	leftClickPan: boolean;
}

export function usePanZoom({ containerRef, view, setView, zoomTo, enabled, leftClickPan }: UsePanZoomOptions) {
	const isPanning = useRef(false);
	const lastPos = useRef({ x: 0, y: 0 });
	const spaceHeld = useRef(false);
	const panningState = useRef(false);
	const leftClickPanRef = useRef(leftClickPan);
	leftClickPanRef.current = leftClickPan;

	// Keep latest view in a ref so handlers don't need it as a dep
	const viewRef = useRef(view);
	viewRef.current = view;

	// Keep latest callbacks in refs for stable handler references
	const setViewRef = useRef(setView);
	setViewRef.current = setView;
	const zoomToRef = useRef(zoomTo);
	zoomToRef.current = zoomTo;

	/* ── Spacebar tracking ── */
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.code === "Space" && !e.repeat && !(e.target instanceof HTMLInputElement)) {
				e.preventDefault();
				spaceHeld.current = true;
			}
		};
		const onKeyUp = (e: KeyboardEvent) => {
			if (e.code === "Space") {
				spaceHeld.current = false;
			}
		};
		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("keyup", onKeyUp);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("keyup", onKeyUp);
		};
	}, []);

	/* ── Pointer events for pan ── */
	useEffect(() => {
		const el = containerRef.current;
		if (!el || !enabled) return;

		const onPointerDown = (e: PointerEvent) => {
			// Middle button, Space+left, or left-click in pointer mode
			const leftPan = e.button === 0 && (spaceHeld.current || leftClickPanRef.current);
			if (e.button === 1 || leftPan) {
				e.preventDefault();
				isPanning.current = true;
				panningState.current = true;
				lastPos.current = { x: e.clientX, y: e.clientY };
				el.setPointerCapture(e.pointerId);
				el.style.cursor = "grabbing";
			}
		};

		const onPointerMove = (e: PointerEvent) => {
			if (!isPanning.current) return;
			const dx = e.clientX - lastPos.current.x;
			const dy = e.clientY - lastPos.current.y;
			lastPos.current = { x: e.clientX, y: e.clientY };
			const v = viewRef.current;
			setViewRef.current({ panX: v.panX + dx, panY: v.panY + dy });
		};

		const onPointerUp = (e: PointerEvent) => {
			if (isPanning.current) {
				isPanning.current = false;
				panningState.current = false;
				el.releasePointerCapture(e.pointerId);
				el.style.cursor = "";
			}
		};

		el.addEventListener("pointerdown", onPointerDown);
		el.addEventListener("pointermove", onPointerMove);
		el.addEventListener("pointerup", onPointerUp);
		el.addEventListener("pointercancel", onPointerUp);

		return () => {
			el.removeEventListener("pointerdown", onPointerDown);
			el.removeEventListener("pointermove", onPointerMove);
			el.removeEventListener("pointerup", onPointerUp);
			el.removeEventListener("pointercancel", onPointerUp);
		};
	}, [containerRef, enabled]);

	/* ── Wheel zoom ── */
	useEffect(() => {
		const el = containerRef.current;
		if (!el || !enabled) return;

		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			const rect = el.getBoundingClientRect();
			const anchorX = e.clientX - rect.left;
			const anchorY = e.clientY - rect.top;

			const v = viewRef.current;
			// Trackpad pinch sends ctrlKey; regular wheel does not
			const delta = e.ctrlKey ? -e.deltaY * 0.01 : -e.deltaY * 0.002;
			const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * (1 + delta)));
			zoomToRef.current(newZoom, anchorX, anchorY);
		};

		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, [containerRef, enabled]);

	const getIsPanning = useCallback(() => panningState.current, []);

	return { getIsPanning };
}
