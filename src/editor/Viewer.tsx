import { useEffect, useRef } from 'react';
import { DropZone } from '@/app/DropZone';
import { useTask } from '@/app/task-context';
import { AudioHeading } from '@/editors/audio/AudioHeading';
import type { MediaKind } from '@/editors/registry';
import { codecName, formatTimecode } from '@/lib/format';
import { type OpenedFile, useSession } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { Tile } from '@/ui/Tile';

function PosterCanvas({ bitmap }: { bitmap: ImageBitmap }) {
	const ref = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const canvas = ref.current;
		if (!canvas) return;
		canvas.width = bitmap.width;
		canvas.height = bitmap.height;
		canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
	}, [bitmap]);
	return <canvas ref={ref} className="stage-picture block max-h-full max-w-full" />;
}

function Message({ children }: { children: string }) {
	return <p className="text-body text-muted">{children}</p>;
}

/**
 * The video open in the video editor, offered to the editors that make something of it: a GIF,
 * its sound, its subtitles.
 */
function FromVideo({ kind }: { kind: MediaKind }) {
	const video = useSession((state) => state.opened.video ?? null);
	const openFrom = useSession((state) => state.openFrom);
	if (!video || kind === 'video' || kind === 'image') return null;
	if (kind === 'audio' && video.info && !video.info.audio) return null;
	return (
		<button
			type="button"
			data-media="video"
			onClick={() => {
				openFrom('video', kind);
			}}
			className="hover:bg-surface border-line-2 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors"
		>
			<Tile kind="video" size="lg" />
			<span className="grid min-w-0">
				<span className="text-body font-semibold">{m.use_open_video()}</span>
				<span className="text-small text-muted truncate" title={video.file.name}>
					{video.file.name}
				</span>
			</span>
		</button>
	);
}

/** An editor with no file yet: where to drop one, and on a task page, what the page is for. */
export function EmptyViewer({ kind }: { kind: MediaKind }) {
	const task = useTask();
	return (
		<div className="grid w-full max-w-[680px] gap-6 max-md:gap-4 max-md:px-4">
			{task && (
				<div className="grid gap-2">
					{/* The page's heading is the editor's own (EditorLayout), read once. */}
					<p className="text-title font-bold tracking-[-0.02em] text-balance" aria-hidden="true">
						{task.title()}
					</p>
					<p className="text-body text-muted">{task.description()}</p>
				</div>
			)}
			<FromVideo kind={kind} />
			<DropZone compact prefer={kind} />
		</div>
	);
}

/** The largest element of every editor. Everything else stays out of its way. */
export function Viewer({ kind, opened }: { kind: MediaKind; opened: OpenedFile | null }) {
	if (!opened) return <EmptyViewer kind={kind} />;

	// While the sound is read: what it is, until its waveform takes the stage.
	if (kind === 'audio') return <AudioHeading opened={opened} />;

	if (opened.poster) return <PosterCanvas bitmap={opened.poster} />;

	if (kind === 'subtitles' && opened.info?.cues?.length) {
		return (
			<ol className="grid max-h-full w-full max-w-[560px] content-center gap-1 overflow-auto">
				{opened.info.cues.slice(0, 8).map((cue) => (
					<li key={`${cue.start}-${cue.text}`} className="grid grid-cols-[104px_minmax(0,1fr)] gap-4 py-1.5">
						<span className="text-small text-muted tabular">{formatTimecode(cue.start)}</span>
						<span className="text-body">{cue.text}</span>
					</li>
				))}
			</ol>
		);
	}

	const video = opened.info?.video;
	if (video && !video.decodable)
		return (
			<Message>
				{m.no_decoder({ codec: video.codec ? codecName(video.codec) : opened.format.toUpperCase() })}
			</Message>
		);
	return <Message>{m.no_preview({ format: opened.format.toUpperCase() })}</Message>;
}
