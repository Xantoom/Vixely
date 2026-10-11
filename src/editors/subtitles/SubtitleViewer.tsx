import { Film, Replace, Trash2, TriangleAlert } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { AssOverlay } from '@/editor/AssOverlay';
import { PlayerPicture } from '@/editor/PlayerControls';
import { usePlayback } from '@/media/playback';
import { m } from '@/paraglide/messages.js';
import { useBoxSize } from '@/ui/use-box-size';
import type { SubtitleDoc } from './document';
import { toAssScript } from './formats';
import { PgsOverlay } from './PgsOverlay';
import { useSubtitleProject } from './project';
import { useSubtitleDoc } from './store';

/** Space between the picture and the playback bar under it, in pixels. */
const GAP = 8;
/** The playback bar keeps this width under a picture narrower than it, in pixels. */
const MIN_BAR = 288;

/** Picture size used without a video: the resolution of the ASS script, or 1080p. */
const DEFAULT_FRAME = { width: 1920, height: 1080 };

/** Size of the picture subtitles are drawn on: the video, else what the subtitles were made for. */
export function subtitleFrame(doc: SubtitleDoc, video: { width: number; height: number } | null) {
	return video ?? (doc.format === 'pgs' ? doc.pgsSize : doc.ass?.playRes) ?? DEFAULT_FRAME;
}

/**
 * Subtitles over the picture at `time`: PGS pictures where the disc places them, text drawn by
 * libass like players do. Fills its parent, which has the frame's proportions.
 */
export function SubtitleLayer({
	doc,
	time,
	title,
	video,
	fonts,
	onFailed,
}: {
	doc: SubtitleDoc;
	time: number;
	title: string;
	video: { width: number; height: number } | null;
	fonts: readonly Uint8Array[];
	onFailed?: () => void;
}) {
	const pictures = doc.format === 'pgs';
	const frame = subtitleFrame(doc, video);
	// Converted subtitles get a style sized for the video they play on.
	const script = useMemo(
		() => (pictures ? '' : toAssScript(doc, title, video ?? undefined)),
		[doc, title, video, pictures],
	);
	if (pictures) return <PgsOverlay doc={doc} time={time} />;
	return (
		<AssOverlay
			// Fonts are loaded as the renderer starts: new ones start a new renderer.
			key={fonts.length}
			script={script}
			// ASS times are in hundredths, rounded: a line at 1.007 s is written 1.01. The time drawn is
			// rounded the same way, or the start of such a line (where picking it goes) shows nothing.
			time={Math.round(time * 100) / 100}
			width={frame.width}
			height={frame.height}
			fonts={fonts}
			onFailed={onFailed}
		/>
	);
}

/** The video (or sound) played under subtitles opened from a file: chosen, replaced or removed. */
function useMediaPicker() {
	const inputRef = useRef<HTMLInputElement>(null);
	const load = usePlayback((state) => state.load);
	const input = (
		<input
			ref={inputRef}
			type="file"
			accept="video/*,audio/*,.mkv,.mka"
			className="hidden"
			tabIndex={-1}
			onChange={(event) => {
				const chosen = event.target.files?.[0];
				if (chosen) load(chosen);
				event.target.value = '';
			}}
		/>
	);
	return {
		input,
		choose: () => inputRef.current?.click(),
		remove: () => {
			load(null);
		},
	};
}

/** In place of the picture while no video is chosen: the way to choose one. */
function ChooseVideo({ onChoose }: { onChoose: () => void }) {
	return (
		<button
			type="button"
			onClick={onChoose}
			className="group border-line-2 bg-surface hover:border-ink-2 absolute inset-0 grid place-content-center justify-items-center gap-3 rounded-md border-[1.5px] border-dashed px-6 text-center transition-colors"
		>
			<span className="bg-ed text-ed-ink grid size-12 place-items-center rounded-xl transition-transform duration-200 group-hover:-translate-y-0.5">
				<Film className="size-6" aria-hidden="true" />
			</span>
			<span className="text-lead font-semibold">{m.subs_video_load()}</span>
		</button>
	);
}

/** The video chosen, its name cut short, and the buttons that replace or remove it. */
function VideoBar({ name, onReplace, onRemove }: { name: string; onReplace: () => void; onRemove: () => void }) {
	return (
		<div className="flex min-w-0 items-center gap-2 max-lg:px-3">
			<Film className="text-muted size-4 flex-none" aria-hidden="true" />
			<span className="text-small text-ink-2 min-w-0 flex-1 truncate" title={name}>
				{name}
			</span>
			<button
				type="button"
				onClick={onReplace}
				className="text-small text-ink-2 hover:bg-surface hover:text-ink flex h-8 flex-none items-center gap-1.5 rounded-sm px-2 font-medium transition-colors"
			>
				<Replace className="size-4" aria-hidden="true" />
				<span className="max-sm:sr-only">{m.subs_video_replace()}</span>
			</button>
			<button
				type="button"
				onClick={onRemove}
				className="text-small text-ink-2 hover:bg-surface hover:text-danger flex h-8 flex-none items-center gap-1.5 rounded-sm px-2 font-medium transition-colors"
			>
				<Trash2 className="size-4" aria-hidden="true" />
				<span className="max-sm:sr-only">{m.subs_video_remove()}</span>
			</button>
		</div>
	);
}

/** The video with the subtitles on it, and its controls: the top-left box, as in Aegisub. */
export function SubtitleViewer({
	title,
	onFit,
	controls,
}: {
	title: string;
	/** Told the width at which the picture fills the height it has, so its column can match it. */
	onFit?: (width: number) => void;
	/** The playback bar, under the picture when the video stands in a column of its own. */
	controls?: ReactNode;
}) {
	const doc = useSubtitleDoc();
	const time = usePlayback((state) => state.time);
	const video = usePlayback((state) => state.details?.video ?? null);
	const failed = usePlayback((state) => state.failed);
	const fonts = useSubtitleProject((state) => state.fonts);
	const areaRef = useRef<HTMLDivElement>(null);
	const area = useBoxSize(areaRef);
	const [rendererFailed, setRendererFailed] = useState(false);
	const file = usePlayback((state) => state.file);
	const fromVideo = useSubtitleProject((state) => state.source === 'video');
	const picker = useMediaPicker();
	const barRef = useRef<HTMLDivElement>(null);
	const bar = useBoxSize(barRef);
	const frame = subtitleFrame(doc, video);
	// The playback bar sits right under the picture, the two centred together.
	const below = controls ? bar.height + GAP : 0;
	const room = Math.max(0, area.height - below);
	const scale = area.width && room ? Math.min(area.width / frame.width, room / frame.height) : 0;
	const width = Math.floor(frame.width * scale);
	const height = Math.floor(frame.height * scale);
	const top = Math.max(0, (area.height - height - below) / 2);
	const fit = room > 0 ? Math.round((room * frame.width) / frame.height) : 0;
	useEffect(() => {
		if (fit > 0) onFit?.(fit);
	}, [fit, onFit]);

	return (
		<div className="flex h-full min-h-0 flex-col gap-2">
			{picker.input}
			{!fromVideo && file && <VideoBar name={file.name} onReplace={picker.choose} onRemove={picker.remove} />}
			<div
				ref={areaRef}
				className="relative min-h-0 flex-1 max-lg:aspect-(--frame) max-lg:max-h-[50svh] max-lg:flex-none"
				// On narrow screens the picture spans the width, as tall as its shape needs.
				style={{ '--frame': `${frame.width} / ${frame.height}` }}
			>
				<div className="absolute inset-x-0" style={controls ? { top, height } : { inset: 0 }}>
					<PlayerPicture width={width} height={height}>
						{width > 0 && (
							<SubtitleLayer
								doc={doc}
								time={time}
								title={title}
								video={video}
								fonts={fonts}
								onFailed={() => {
									setRendererFailed(true);
								}}
							/>
						)}
						{(failed || rendererFailed) && (
							<span
								className="bg-danger absolute top-2 right-2 grid size-7 place-items-center rounded-full text-white"
								title={rendererFailed ? m.subs_renderer_failed() : m.subs_media_failed()}
							>
								<TriangleAlert size={15} aria-hidden="true" />
							</span>
						)}
					</PlayerPicture>
				</div>
				{/* Always there, so its size is known as soon as a video turns the layout into a column. */}
				<div
					ref={barRef}
					className={controls ? 'absolute left-1/2 max-w-full min-w-0 -translate-x-1/2' : 'hidden'}
					style={{ top: top + height + GAP, width: Math.max(width, MIN_BAR) }}
				>
					{controls}
				</div>
				{!fromVideo && !file && <ChooseVideo onChoose={picker.choose} />}
			</div>
		</div>
	);
}
