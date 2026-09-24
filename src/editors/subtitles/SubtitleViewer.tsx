import { Film, TriangleAlert, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { AssOverlay } from '@/editor/AssOverlay';
import { PlayerControls, PlayerPicture } from '@/editor/PlayerControls';
import { usePlayback } from '@/media/playback';
import { m } from '@/paraglide/messages.js';
import { IconButton } from '@/ui/Button';
import { useBoxSize } from '@/ui/use-box-size';
import type { SubtitleDoc } from './document';
import { toAssScript } from './formats';
import { PgsOverlay } from './PgsOverlay';
import { useSubtitleProject } from './project';
import { useSubtitleDoc } from './store';

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
			time={time}
			width={frame.width}
			height={frame.height}
			fonts={fonts}
			onFailed={onFailed}
		/>
	);
}

/** Picks the video (or audio) played under subtitles opened from a file, or removes it. */
export function ChooseMedia() {
	const inputRef = useRef<HTMLInputElement>(null);
	const file = usePlayback((state) => state.file);
	const load = usePlayback((state) => state.load);
	const fromVideo = useSubtitleProject((state) => state.source === 'video');
	if (fromVideo) return null;
	return (
		<div className="flex min-w-0 items-center gap-0.5">
			<input
				ref={inputRef}
				type="file"
				accept="video/*,audio/*,.mkv,.mka"
				className="hidden"
				onChange={(event) => {
					const chosen = event.target.files?.[0];
					if (chosen) load(chosen);
					event.target.value = '';
				}}
			/>
			<button
				type="button"
				title={m.subs_media_choose()}
				onClick={() => inputRef.current?.click()}
				className="text-ui text-ink-2 hover:text-ink hover:bg-surface inline-flex h-8 max-w-56 min-w-0 items-center gap-1.5 rounded-sm px-2 font-medium shadow-[inset_0_0_0_1px_var(--line-2)] transition-colors"
			>
				<Film size={15} aria-hidden="true" className="flex-none" />
				<span className="truncate">{file ? file.name : m.subs_media_choose_short()}</span>
			</button>
			{file && (
				<IconButton
					label={m.subs_media_remove()}
					onClick={() => {
						load(null);
					}}
				>
					<X size={15} />
				</IconButton>
			)}
		</div>
	);
}

/** The video with the subtitles on it, and its controls: the top-left box, as in Aegisub. */
export function SubtitleViewer({ title }: { title: string }) {
	const doc = useSubtitleDoc();
	const time = usePlayback((state) => state.time);
	const video = usePlayback((state) => state.details?.video ?? null);
	const failed = usePlayback((state) => state.failed);
	const fonts = useSubtitleProject((state) => state.fonts);
	const areaRef = useRef<HTMLDivElement>(null);
	const area = useBoxSize(areaRef);
	const [rendererFailed, setRendererFailed] = useState(false);
	const frame = subtitleFrame(doc, video);
	const scale = area.width && area.height ? Math.min(area.width / frame.width, area.height / frame.height) : 0;
	const width = Math.floor(frame.width * scale);
	const height = Math.floor(frame.height * scale);

	return (
		<div className="flex h-full min-h-0 flex-col gap-2">
			<div ref={areaRef} className="relative min-h-0 flex-1">
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
			<PlayerControls>
				<ChooseMedia />
			</PlayerControls>
		</div>
	);
}
