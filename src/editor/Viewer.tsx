import { AudioLines } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { DropZone } from '@/app/DropZone';
import type { MediaKind } from '@/editors/registry';
import { formatTimecode } from '@/lib/format';
import type { OpenedFile } from '@/media/session';
import { m } from '@/paraglide/messages.js';

function PosterCanvas({ bitmap }: { bitmap: ImageBitmap }) {
	const ref = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const canvas = ref.current;
		if (!canvas) return;
		canvas.width = bitmap.width;
		canvas.height = bitmap.height;
		canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
	}, [bitmap]);
	return <canvas ref={ref} className="block max-h-full max-w-full rounded-[4px] shadow-[0_0_0_1px_var(--line)]" />;
}

function Message({ children }: { children: string }) {
	return <p className="text-body text-muted">{children}</p>;
}

/** The largest element of every editor. Everything else stays out of its way. */
export function Viewer({ kind, opened }: { kind: MediaKind; opened: OpenedFile | null }) {
	if (!opened) {
		return (
			<div className="w-full max-w-[680px]">
				<DropZone compact prefer={kind} />
			</div>
		);
	}

	if (kind === 'audio') {
		const tags = opened.info?.tags;
		const byline = [tags?.artist, tags?.album].filter(Boolean).join(', ');
		return (
			<div className="grid h-full max-h-[560px] w-full grid-rows-[minmax(0,1fr)_auto] justify-items-center gap-6 text-center">
				<div className="flex min-h-0 w-full items-center justify-center">
					{opened.poster ? (
						<PosterCanvas bitmap={opened.poster} />
					) : (
						// Stands in for cover art: the same place and proportions, without pretending to be one.
						<div
							className="bg-ed-soft text-ed-text grid aspect-square h-full max-h-60 place-items-center rounded-[20px]"
							aria-hidden="true"
						>
							<AudioLines size={64} strokeWidth={1.4} />
						</div>
					)}
				</div>
				<div className="grid gap-1.5">
					<p className="text-title font-bold tracking-[-0.03em]">{tags?.title ?? opened.file.name}</p>
					{byline && <p className="text-body text-muted">{byline}</p>}
				</div>
			</div>
		);
	}

	if (opened.poster) return <PosterCanvas bitmap={opened.poster} />;

	if (kind === 'subtitles' && opened.info?.cues?.length) {
		return (
			<ol className="grid max-h-full w-full max-w-[560px] content-center gap-1 overflow-auto">
				{opened.info.cues.slice(0, 8).map((cue) => (
					<li key={`${cue.start}-${cue.text}`} className="grid grid-cols-[104px_minmax(0,1fr)] gap-4 py-1.5">
						<span className="text-small text-muted tabular font-mono">{formatTimecode(cue.start)}</span>
						<span className="text-body">{cue.text}</span>
					</li>
				))}
			</ol>
		);
	}

	return <Message>{m.no_preview({ format: opened.format.toUpperCase() })}</Message>;
}
