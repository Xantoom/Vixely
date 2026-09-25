import { Link } from '@tanstack/react-router';
import { EDITORS, type MediaKind } from '@/editors/registry';
import { m } from '@/paraglide/messages.js';
import { Tile } from '@/ui/Tile';
import { AppBar } from './AppBar';
import { DropZone } from './DropZone';
import { usePageHead } from './head';
import { SiteFooter } from './SiteFooter';

interface Task {
	id: string;
	label: () => string;
	to: MediaKind;
	/** The task page it opens, else the editor itself. */
	slug?: string;
}

interface Column {
	kind: MediaKind | 'batch';
	label: () => string;
	to: MediaKind;
	tasks: Task[];
}

const COLUMNS: Column[] = [
	{
		kind: 'video',
		label: () => m.media_video(),
		to: 'video',
		tasks: [
			{ id: 'trim', label: () => m.task_trim(), to: 'video', slug: 'trim-video' },
			{ id: 'compress', label: () => m.task_compress(), to: 'video', slug: 'compress-video' },
			{ id: 'convert', label: () => m.task_convert(), to: 'video', slug: 'convert-video' },
		],
	},
	{
		kind: 'image',
		label: () => m.media_image(),
		to: 'image',
		tasks: [
			{ id: 'resize', label: () => m.task_resize(), to: 'image', slug: 'resize-image' },
			{ id: 'compress', label: () => m.task_compress(), to: 'image', slug: 'compress-image' },
			{ id: 'convert', label: () => m.task_convert(), to: 'image', slug: 'convert-image' },
		],
	},
	{
		kind: 'gif',
		label: () => m.media_gif(),
		to: 'gif',
		tasks: [
			{ id: 'from-video', label: () => m.task_video_to_gif(), to: 'gif', slug: 'video-to-gif' },
			{ id: 'optimize', label: () => m.task_optimize(), to: 'gif', slug: 'optimize-gif' },
			{ id: 'convert', label: () => m.task_gif_to_mp4(), to: 'gif', slug: 'gif-to-mp4' },
		],
	},
	{
		kind: 'audio',
		label: () => m.media_audio(),
		to: 'audio',
		tasks: [
			{ id: 'trim', label: () => m.task_trim(), to: 'audio', slug: 'trim-audio' },
			{ id: 'normalize', label: () => m.task_normalize(), to: 'audio', slug: 'normalize-audio' },
			{ id: 'convert', label: () => m.task_convert(), to: 'audio', slug: 'convert-audio' },
		],
	},
	{
		kind: 'subtitles',
		label: () => m.media_subtitles(),
		to: 'subtitles',
		tasks: [
			{ id: 'resync', label: () => m.task_resync(), to: 'subtitles', slug: 'resync-subtitles' },
			{ id: 'convert', label: () => m.task_convert(), to: 'subtitles', slug: 'convert-subtitles' },
			{ id: 'extract', label: () => m.task_extract(), to: 'subtitles', slug: 'extract-subtitles' },
		],
	},
	{
		kind: 'batch',
		label: () => m.media_batch(),
		to: 'image',
		tasks: [
			{ id: 'images', label: () => m.task_many_images(), to: 'image' },
			{ id: 'videos', label: () => m.task_many_videos(), to: 'video' },
			{ id: 'audio', label: () => m.task_many_audio(), to: 'audio' },
		],
	},
];

export function HomeScreen() {
	usePageHead(null);
	return (
		<div className="flex min-h-full flex-col">
			<AppBar />
			<main className="mx-auto grid w-full max-w-[1200px] flex-1 content-start gap-12 px-5 py-10 sm:px-10 sm:py-16 lg:px-16 lg:py-18">
				<div className="grid gap-3.5">
					<h1 className="text-display max-w-[15ch] font-bold tracking-[-0.045em] text-balance">
						{m.home_title()}
					</h1>
					<p className="text-lead text-muted max-w-[46ch]">{m.home_lede()}</p>
				</div>

				<DropZone />

				<nav aria-label="Tools" className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 xl:grid-cols-6">
					{COLUMNS.map((column) => (
						<div key={column.kind} data-media={column.kind}>
							<Link
								to={EDITORS[column.to].path}
								className="hover:text-ed-text mb-3.5 flex items-center gap-2.5 text-[15px] font-semibold tracking-[-0.01em] transition-colors"
							>
								<Tile kind={column.kind} />
								{column.label()}
							</Link>
							<ul className="grid gap-2">
								{column.tasks.map((task) => (
									<li key={task.id}>
										<Link
											to={task.slug ? '/tools/$task' : EDITORS[task.to].path}
											params={task.slug ? { task: task.slug } : {}}
											className="text-body text-muted hover:text-ed-text underline-offset-[3px] transition-colors hover:underline"
										>
											{task.label()}
										</Link>
									</li>
								))}
							</ul>
						</div>
					))}
				</nav>

				<SiteFooter />
			</main>
		</div>
	);
}
