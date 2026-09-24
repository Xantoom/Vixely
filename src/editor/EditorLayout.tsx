import { type ReactNode, useEffect } from 'react';
import { AppBar, type EditorActions } from '@/app/AppBar';
import { EDITORS, type MediaKind, TOOL_LABELS, type ToolId } from '@/editors/registry';
import { m } from '@/paraglide/messages.js';
import { TOOL_ICONS } from '@/ui/icons';

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

interface EditorLayoutProps {
	kind: MediaKind;
	fileName?: string;
	tool: ToolId;
	onTool: (tool: ToolId) => void;
	/** Tools shown in the rail, when they differ from the editor's usual ones (in a batch). */
	tools?: ToolId[];
	actions?: EditorActions;
	viewer?: ReactNode;
	timeline?: ReactNode;
	/** Takes the place of the preview and the timeline, for editors laid out their own way. */
	workspace?: ReactNode;
	inspector: ReactNode;
	/** Sticks to the bottom of the inspector, for the final action of a panel. */
	inspectorFooter?: ReactNode;
}

/**
 * The shared layout of every editor: tools on the left, the preview in the middle, settings on
 * the right, the timeline below. On small screens the tools move to a bottom bar within thumb reach.
 */
export function EditorLayout({
	kind,
	fileName,
	tool,
	onTool,
	tools,
	actions,
	viewer,
	timeline,
	workspace,
	inspector,
	inspectorFooter,
}: EditorLayoutProps) {
	const editor = EDITORS[kind];

	useEffect(() => {
		document.title = `${editor.label()}, Vixely`;
		return () => {
			document.title = 'Vixely';
		};
	}, [editor]);

	return (
		<div data-media={kind} className="flex h-full min-h-0 flex-col">
			<AppBar editor={kind} fileName={fileName} actions={actions} />
			<div className="grid min-h-0 flex-1 max-lg:grid-rows-[auto_auto_auto_auto] lg:grid-cols-[76px_minmax(0,1fr)_320px] lg:grid-rows-[minmax(0,1fr)_auto]">
				<div className="max-lg:order-4 lg:row-span-2">
					<Rail tools={tools ?? editor.tools} current={tool} onSelect={onTool} />
				</div>
				{workspace ? (
					<section
						aria-label={m.preview()}
						className="bg-canvas min-w-0 overflow-hidden max-lg:order-1 max-lg:h-[64dvh] lg:row-span-2"
					>
						{workspace}
					</section>
				) : (
					<>
						<section
							aria-label={m.preview()}
							className="bg-canvas relative min-w-0 overflow-hidden max-lg:order-1 max-lg:h-[max(280px,min(56vw,460px))]"
						>
							{/* A box with a definite size, so the media can be contained in it whatever its resolution. */}
							<div className="absolute inset-4 flex items-center justify-center sm:inset-6">{viewer}</div>
						</section>
						<div className="max-lg:order-2 lg:col-start-2 lg:row-start-2">{timeline}</div>
					</>
				)}
				<div className="border-line flex min-h-0 flex-col max-lg:order-3 max-lg:border-t lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:border-l">
					<aside
						aria-label={m.inspector()}
						className="grid min-h-0 flex-1 content-start gap-6 overflow-auto px-5 py-6"
					>
						{inspector}
					</aside>
					{inspectorFooter && (
						<div className="border-line grid gap-3.5 border-t px-5 pt-4 pb-5">{inspectorFooter}</div>
					)}
				</div>
			</div>
		</div>
	);
}

export function PanelTitle({ children, action }: { children: string; action?: ReactNode }) {
	return (
		<div className="flex items-baseline justify-between gap-3">
			<h2 className="text-title font-bold tracking-[-0.03em]">{children}</h2>
			{action}
		</div>
	);
}
