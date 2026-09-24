import { Film, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AssOverlay } from '@/editor/AssOverlay';
import { formatPreciseTime } from '@/lib/format';
import { m } from '@/paraglide/messages.js';
import { useBoxSize } from '@/ui/use-box-size';
import { cuesAt } from './document';
import type { SubtitleEngine } from './engine';
import { toAssScript } from './formats';
import { useSubtitleDoc, useSubtitleEditor } from './store';

/** Picture size used without a video: the resolution of the ASS script, or 1080p. */
const DEFAULT_FRAME = { width: 1920, height: 1080 };

/** Lets the user pick a video (or audio) to play under the subtitles. */
export function ChooseMedia({ engine, compact = false }: { engine: SubtitleEngine; compact?: boolean }) {
	const inputRef = useRef<HTMLInputElement>(null);
	const media = engine.media;
	return (
		<div className="flex min-w-0 items-center gap-2">
			<input
				ref={inputRef}
				type="file"
				accept="video/*,audio/*,.mkv,.mka"
				className="hidden"
				onChange={(event) => {
					const file = event.target.files?.[0];
					if (file) engine.attachMedia(file);
					event.target.value = '';
				}}
			/>
			<button
				type="button"
				onClick={() => inputRef.current?.click()}
				className="text-ui text-ink-2 hover:text-ink hover:bg-surface inline-flex h-8 min-w-0 items-center gap-2 rounded-sm px-2.5 font-medium shadow-[inset_0_0_0_1px_var(--line-2)] transition-colors"
			>
				<Film size={15} aria-hidden="true" className="flex-none" />
				<span className="truncate">
					{media ? media.file.name : compact ? m.subs_media_choose_short() : m.subs_media_choose()}
				</span>
			</button>
			{media && (
				<button
					type="button"
					aria-label={m.subs_media_remove()}
					title={m.subs_media_remove()}
					onClick={() => {
						engine.attachMedia(null);
					}}
					className="text-muted hover:text-ink hover:bg-surface grid size-8 flex-none place-items-center rounded-sm transition-colors"
				>
					<X size={15} aria-hidden="true" />
				</button>
			)}
		</div>
	);
}

/**
 * The picture with the subtitles on it, drawn by libass at the playhead. Without a video, the
 * subtitles show on black at the script's resolution.
 */
export function SubtitleViewer({ engine, title }: { engine: SubtitleEngine; title: string }) {
	const doc = useSubtitleDoc();
	const playhead = useSubtitleEditor((state) => state.playhead);
	const areaRef = useRef<HTMLDivElement>(null);
	const videoRef = useRef<HTMLCanvasElement>(null);
	const area = useBoxSize(areaRef);
	const [rendererFailed, setRendererFailed] = useState(false);
	const media = engine.media;
	const video = media?.details?.video ?? null;
	const frame = video ?? doc.ass?.playRes ?? DEFAULT_FRAME;
	const scale = area.width && area.height ? Math.min(area.width / frame.width, area.height / frame.height) : 0;
	const display = { width: Math.floor(frame.width * scale), height: Math.floor(frame.height * scale) };
	// Converted subtitles get a style sized for the video they play on.
	const script = useMemo(() => toAssScript(doc, title, video ?? undefined), [doc, title, video]);
	const showing = cuesAt(doc, playhead * 1000).length;

	useEffect(() => {
		const canvas = videoRef.current;
		if (!canvas || !media || display.width === 0) return;
		const ratio = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width = Math.round(display.width * ratio);
		canvas.height = Math.round(display.height * ratio);
		media.player.attach(canvas);
	}, [media, display.width, display.height]);

	return (
		<div className="flex h-full w-full flex-col gap-3">
			<div ref={areaRef} className="relative min-h-0 flex-1">
				<div
					className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[3px] bg-black shadow-[0_0_0_1px_var(--line)]"
					style={display}
				>
					{video && <canvas ref={videoRef} className="absolute inset-0 size-full" />}
					{display.width > 0 && (
						<AssOverlay
							script={script}
							time={playhead}
							width={frame.width}
							height={frame.height}
							onFailed={() => {
								setRendererFailed(true);
							}}
						/>
					)}
				</div>
			</div>
			<div className="text-small text-muted tabular flex h-9 flex-none items-center justify-center gap-5 font-mono">
				{rendererFailed ? (
					<span className="text-danger font-sans">{m.subs_renderer_failed()}</span>
				) : media?.failed ? (
					<span className="text-danger font-sans">{m.subs_media_failed()}</span>
				) : (
					<>
						<span>
							{frame.width} × {frame.height}
						</span>
						<span>{formatPreciseTime(playhead)}</span>
						<span>{m.subs_showing({ count: showing })}</span>
					</>
				)}
			</div>
		</div>
	);
}
