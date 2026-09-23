import { Link } from '@tanstack/react-router';
import { EDITORS, type MediaKind, type ToolId } from '@/editors/registry';
import { m } from '@/paraglide/messages.js';
import { Tile } from '@/ui/Tile';
import { AppBar } from './AppBar';
import { DropZone } from './DropZone';

interface Task {
	id: string;
	label: () => string;
	to: MediaKind;
	tool?: ToolId;
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
			{ id: 'trim', label: () => m.task_trim(), to: 'video', tool: 'trim' },
			{ id: 'compress', label: () => m.task_compress(), to: 'video' },
			{ id: 'convert', label: () => m.task_convert(), to: 'video' },
		],
	},
	{
		kind: 'image',
		label: () => m.media_image(),
		to: 'image',
		tasks: [
			{ id: 'resize', label: () => m.task_resize(), to: 'image', tool: 'crop' },
			{ id: 'compress', label: () => m.task_compress(), to: 'image' },
			{ id: 'convert', label: () => m.task_convert(), to: 'image' },
		],
	},
	{
		kind: 'gif',
		label: () => m.media_gif(),
		to: 'gif',
		tasks: [
			{ id: 'from-video', label: () => m.task_video_to_gif(), to: 'gif', tool: 'trim' },
			{ id: 'optimize', label: () => m.task_optimize(), to: 'gif' },
			{ id: 'convert', label: () => m.task_convert(), to: 'gif' },
		],
	},
	{
		kind: 'audio',
		label: () => m.media_audio(),
		to: 'audio',
		tasks: [
			{ id: 'trim', label: () => m.task_trim(), to: 'audio', tool: 'trim' },
			{ id: 'normalize', label: () => m.task_normalize(), to: 'audio', tool: 'audio' },
			{ id: 'convert', label: () => m.task_convert(), to: 'audio' },
		],
	},
	{
		kind: 'subtitles',
		label: () => m.media_subtitles(),
		to: 'subtitles',
		tasks: [
			{ id: 'resync', label: () => m.task_resync(), to: 'subtitles', tool: 'subtitles' },
			{ id: 'convert', label: () => m.task_convert(), to: 'subtitles' },
			{ id: 'extract', label: () => m.task_extract(), to: 'subtitles' },
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
											to={EDITORS[task.to].path}
											search={task.tool ? { tool: task.tool } : {}}
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

				<footer className="border-line text-ui text-muted border-t pt-6">
					<Link to="/system" className="hover:text-ink underline-offset-[3px] hover:underline">
						{m.home_capabilities()}
					</Link>
				</footer>
			</main>
		</div>
	);
}
