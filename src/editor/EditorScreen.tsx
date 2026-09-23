import { useEffect, useState } from 'react';
import { AppBar } from '@/app/AppBar';
import { EDITORS, type MediaKind, TOOL_LABELS, type ToolId } from '@/editors/registry';
import { useSession } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { TOOL_ICONS } from '@/ui/icons';
import { Inspector } from './Inspector';
import { Timeline } from './Timeline';
import { Viewer } from './Viewer';

function Rail({ tools, current, onSelect }: { tools: ToolId[]; current: ToolId; onSelect: (tool: ToolId) => void }) {
	return (
		<nav
			aria-label={m.editing_tools()}
			className="border-line flex gap-1 max-lg:border-t max-lg:px-1 max-lg:pt-1.5 max-lg:pb-[calc(6px+env(safe-area-inset-bottom,0px))] lg:h-full lg:flex-col lg:items-center lg:border-r lg:px-1.5 lg:py-3"
		>
			{tools.map((tool) => {
				const Icon = TOOL_ICONS[tool];
				return (
					<button
						key={tool}
						type="button"
						aria-pressed={tool === current}
						onClick={() => {
							onSelect(tool);
						}}
						className="text-muted hover:bg-surface hover:text-ink aria-pressed:bg-ed-soft aria-pressed:text-ed-text grid justify-items-center gap-1 rounded-sm pt-2.5 pb-2 transition-colors max-lg:min-h-13 max-lg:flex-1 lg:w-16"
					>
						<Icon size={20} strokeWidth={1.8} aria-hidden="true" />
						<span className="text-caption font-medium">{TOOL_LABELS[tool]()}</span>
					</button>
				);
			})}
		</nav>
	);
}

/**
 * The shared layout of every editor: tools on the left, the preview in the middle, settings on
 * the right, the timeline below. On small screens the tools move to a bottom bar within thumb reach.
 */
export function EditorScreen({ kind, initialTool }: { kind: MediaKind; initialTool?: ToolId }) {
	const editor = EDITORS[kind];
	const current = useSession((state) => state.current);
	const opened = current?.kind === kind ? current : null;
	const [tool, setTool] = useState<ToolId>(initialTool && editor.tools.includes(initialTool) ? initialTool : 'info');

	useEffect(() => {
		document.title = `${editor.label()}, Vixely`;
		return () => {
			document.title = 'Vixely';
		};
	}, [editor]);

	return (
		<div data-media={kind} className="flex h-full min-h-0 flex-col">
			<AppBar editor={kind} fileName={opened?.file.name} />
			<div className="grid min-h-0 flex-1 max-lg:grid-rows-[auto_auto_auto_auto] lg:grid-cols-[76px_minmax(0,1fr)_320px] lg:grid-rows-[minmax(0,1fr)_auto]">
				<div className="max-lg:order-4 lg:row-span-2">
					<Rail tools={editor.tools} current={tool} onSelect={setTool} />
				</div>
				<section
					aria-label={m.preview()}
					className="bg-canvas relative min-w-0 overflow-hidden max-lg:order-1 max-lg:h-[max(280px,min(56vw,460px))]"
				>
					{/* A box with a definite size, so the media can be contained in it whatever its resolution. */}
					<div className="absolute inset-4 flex items-center justify-center sm:inset-6">
						<Viewer kind={kind} opened={opened} />
					</div>
				</section>
				<div className="max-lg:order-2 lg:col-start-2 lg:row-start-2">
					{editor.timed && opened && <Timeline info={opened.info} poster={opened.poster} />}
				</div>
				<div className="border-line min-h-0 max-lg:order-3 max-lg:border-t lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:border-l">
					<Inspector kind={kind} tool={tool} opened={opened} />
				</div>
			</div>
		</div>
	);
}
