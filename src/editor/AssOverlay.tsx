import type JASSUB from 'jassub';
import defaultFont from 'jassub/dist/default.woff2?url';
import { useEffect, useRef, useState } from 'react';

/**
 * Subtitles drawn by libass (through JASSUB), over a picture of `width` × `height`: the same
 * renderer players use, so styles, positions and effects show as they will on a screen. It fills
 * its parent, which should have the picture's proportions.
 */
export function AssOverlay({
	script,
	time,
	width,
	height,
	fonts,
	onFailed,
}: {
	/** A complete ASS script. */
	script: string;
	/** Seconds. */
	time: number;
	width: number;
	height: number;
	/** Font files the script uses, such as those embedded in a video. Read when the renderer starts: give the overlay a new key when they change. */
	fonts?: readonly Uint8Array[];
	onFailed?: () => void;
}) {
	const hostRef = useRef<HTMLDivElement>(null);
	const scriptRef = useRef(script);
	scriptRef.current = script;
	const failedRef = useRef(onFailed);
	failedRef.current = onFailed;
	const sizeRef = useRef({ width, height });
	sizeRef.current = { width, height };
	const fontsRef = useRef(fonts);
	fontsRef.current = fonts;
	const [renderer, setRenderer] = useState<JASSUB | null>(null);

	// The canvas is handed over to a worker, which can happen only once: each renderer gets its own.
	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		const canvas = document.createElement('canvas');
		canvas.className = 'absolute inset-0 size-full';
		host.append(canvas);
		let alive = true;
		let created: JASSUB | null = null;
		// libass is only downloaded once subtitles are shown.
		void import('jassub')
			.then(async ({ default: Renderer }) => {
				if (!alive) return;
				// The fallback font (Liberation Sans, metric-compatible with Arial) is loaded up front:
				// fetched on demand, the first frame would be drawn before it arrives, and stay empty.
				created = new Renderer({
					canvas,
					subContent: scriptRef.current,
					fonts: [defaultFont, ...(fontsRef.current ?? [])],
					queryFonts: false,
				});
				// JASSUB watches the canvas size itself, but in canvas mode it can measure before it
				// knows the picture size, and it redraws nothing after a resize: sizing is done here.
				created._ro.disconnect();
				created._videoWidth = sizeRef.current.width;
				created._videoHeight = sizeRef.current.height;
				await created.ready;
				if (!alive) return;
				await created.resize(true);
				if (alive) setRenderer(created);
			})
			.catch(() => {
				if (alive) failedRef.current?.();
			});
		return () => {
			alive = false;
			setRenderer(null);
			void created?.destroy();
			canvas.remove();
		};
	}, []);

	useEffect(() => {
		if (!renderer) return;
		const frame = { mediaTime: time, width, height, expectedDisplayTime: performance.now() };
		void (async () => {
			await renderer.renderer.setTrack(script);
			await renderer.manualRender(frame, true);
		})();
		// The time is read here without being a trigger: the next effect follows it.
		// oxlint-disable-next-line react-hooks/exhaustive-deps
	}, [renderer, script]);

	useEffect(() => {
		if (!renderer) return;
		void renderer.manualRender({ mediaTime: time, width, height, expectedDisplayTime: performance.now() });
	}, [renderer, time, width, height]);

	// A new size redraws the current subtitles at once, sharp at the new resolution.
	useEffect(() => {
		const host = hostRef.current;
		if (!renderer || !host) return;
		const observer = new ResizeObserver(() => {
			void renderer.resize(true);
		});
		observer.observe(host);
		return () => {
			observer.disconnect();
		};
	}, [renderer]);

	return <div ref={hostRef} className="pointer-events-none absolute inset-0" aria-hidden="true" />;
}
