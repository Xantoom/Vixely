import { AudioLines } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { OpenedFile } from '@/media/session';

/** The cover, filled into a square of `side` pixels. */
function Cover({
	bitmap,
	side = 128,
	className = 'size-full',
}: {
	bitmap: ImageBitmap;
	side?: number;
	className?: string;
}) {
	const ref = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const canvas = ref.current;
		if (!canvas) return;
		canvas.width = side;
		canvas.height = side;
		// Filled and centred, as players show covers.
		const scale = Math.max(side / bitmap.width, side / bitmap.height);
		const width = bitmap.width * scale;
		const height = bitmap.height * scale;
		canvas.getContext('2d')?.drawImage(bitmap, (side - width) / 2, (side - height) / 2, width, height);
	}, [bitmap, side]);
	return <canvas ref={ref} className={className} />;
}

/** What is playing: its cover, title and artist, above the waveform. */
export function AudioHeading({ opened }: { opened: OpenedFile }) {
	const tags = opened.info?.tags;
	const byline = [tags?.artist, tags?.album].filter(Boolean).join(', ');
	return (
		<div className="flex min-w-0 items-center gap-4">
			<div
				className="bg-ed-soft text-ed-text grid size-14 flex-none place-items-center overflow-hidden rounded-sm md:size-16"
				aria-hidden="true"
			>
				{opened.poster ? <Cover bitmap={opened.poster} /> : <AudioLines size={26} strokeWidth={1.75} />}
			</div>
			<div className="grid min-w-0 gap-0.5">
				<p className="text-title truncate font-semibold tracking-[-0.015em]">
					{tags?.title || opened.file.name}
				</p>
				{byline && <p className="text-ui text-muted truncate">{byline}</p>}
			</div>
		</div>
	);
}

/**
 * What is playing, as music players show it: the cover large, the title and artist beside it,
 * the cover's colours blurred behind. Without a cover, a tile in the editor's colour.
 */
export function AudioStage({ opened, length }: { opened: OpenedFile; length: string }) {
	const tags = opened.info?.tags;
	const poster = opened.poster;
	const details = [opened.format.toUpperCase(), length].filter(Boolean).join(', ');
	return (
		<div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 py-4 max-md:flex-none md:px-10 md:py-8">
			{poster && (
				<div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-30 dark:opacity-25">
					<Cover bitmap={poster} side={48} className="size-full scale-125 blur-3xl saturate-150" />
				</div>
			)}
			<div className="relative flex h-full max-h-[28rem] min-h-0 w-full max-w-4xl items-center gap-4 md:gap-10">
				<div
					className="bg-ed-soft text-ed-text grid aspect-square h-full max-h-full min-h-0 flex-none place-items-center overflow-hidden rounded-lg shadow-[0_24px_60px_-20px_rgb(0_0_0/0.45),0_0_0_1px_rgb(0_0_0/0.06)] max-md:size-24 max-md:rounded-md"
					aria-hidden="true"
				>
					{poster ? (
						<Cover bitmap={poster} side={1024} />
					) : (
						<AudioLines className="size-1/3" strokeWidth={1.25} />
					)}
				</div>
				<div className="grid min-w-0 gap-1 md:gap-1.5">
					<p className="font-display text-[clamp(1.25rem,2.6vw,2.4rem)] leading-tight font-semibold tracking-[-0.02em] [overflow-wrap:anywhere]">
						{tags?.title || opened.file.name}
					</p>
					{tags?.artist && <p className="text-lead text-ink-2 truncate">{tags.artist}</p>}
					{tags?.album && <p className="text-ui text-muted truncate">{tags.album}</p>}
					<p className="text-small text-muted tabular md:mt-2">{details}</p>
				</div>
			</div>
		</div>
	);
}
