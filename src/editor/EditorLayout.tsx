import { useNavigate } from '@tanstack/react-router';
import { Download, House, Keyboard, Languages, Moon, Redo2, Scan, Sun, Undo2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { createContext, type ReactNode, use, useEffect, useRef, useState } from 'react';
import { AppBar, type EditorActions } from '@/app/AppBar';
import { useTask } from '@/app/task-context';
import { useTheme } from '@/app/theme';
import { EDITOR_ORDER, EDITORS, type MediaKind, TOOL_LABELS, type ToolId } from '@/editors/registry';
import { m } from '@/paraglide/messages.js';
import { getLocale, setLocale } from '@/paraglide/runtime.js';
import { IconButton } from '@/ui/Button';
import { MEDIA_ICONS, TOOL_ICONS } from '@/ui/icons';
import { type Command, CommandPalette, type ShortcutGroup, ShortcutHelp } from './CommandPalette';
import { isTyping } from './shortcuts';
import { useStageZoom } from './ZoomStage';

/** Lets the panel's own title close the panel. */
const PanelContext = createContext<(() => void) | null>(null);

function Rail({
	tools,
	current,
	open,
	onSelect,
}: {
	tools: ToolId[];
	current: ToolId;
	open: boolean;
	onSelect: (tool: ToolId) => void;
}) {
	return (
		<nav
			aria-label={m.editing_tools()}
			className="border-line bg-bg flex gap-1 max-md:overflow-x-auto max-md:border-t max-md:px-1.5 max-md:pt-1.5 max-md:pb-[calc(0.375rem+env(safe-area-inset-bottom,0px))] md:h-full md:flex-col md:items-stretch md:border-r md:px-2 md:py-3"
		>
			{tools.map((tool) => {
				const Icon = TOOL_ICONS[tool];
				const pressed = open && tool === current;
				return (
					<button
						key={tool}
						type="button"
						aria-pressed={pressed}
						onClick={() => {
							onSelect(tool);
						}}
						className="group text-caption text-muted hover:bg-surface hover:text-ink aria-pressed:bg-ed-soft aria-pressed:text-ed-text grid min-w-15 flex-1 justify-items-center gap-1.5 rounded-md px-1 pt-3 pb-2.5 font-medium transition-colors duration-200 md:flex-none"
					>
						<Icon
							strokeWidth={1.75}
							aria-hidden="true"
							className="ease-spring size-[1.4rem] transition-transform duration-300 group-hover:-translate-y-px"
						/>
						<span>{TOOL_LABELS[tool]()}</span>
					</button>
				);
			})}
		</nav>
	);
}

/** Where the sheet rests on a phone, as the share of its height hidden below the screen. */
const SHEET_HALF = 45;

/**
 * The inspector: a panel beside the rail on larger screens, which the rail opens and closes; on a
 * phone, a sheet over the preview, dragged by its handle between half and full height.
 */
function Panel({
	open,
	onClose,
	children,
	footer,
}: {
	open: boolean;
	onClose: () => void;
	children: ReactNode;
	footer?: ReactNode;
}) {
	const [rest, setRest] = useState(SHEET_HALF);
	const [drag, setDrag] = useState<number | null>(null);
	const start = useRef<{ y: number; rest: number; height: number } | null>(null);
	useEffect(() => {
		if (open) setRest(SHEET_HALF);
	}, [open]);
	const hidden = drag ?? rest;
	return (
		<div
			data-open={open}
			style={{ '--sheet': `${open ? hidden : 105}%` }}
			className={`border-line bg-bg flex min-h-0 flex-col overflow-hidden max-md:absolute max-md:inset-x-0 max-md:bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] max-md:z-20 max-md:h-[82%] max-md:translate-y-(--sheet) max-md:rounded-t-[1.25rem] max-md:shadow-[0_-12px_40px_-12px_rgb(0_0_0/0.35)] md:border-r ${drag === null ? 'ease-spring transition-transform duration-[340ms]' : ''}`}
		>
			<div
				aria-hidden="true"
				className="grid h-6 flex-none cursor-grab touch-none place-items-center md:hidden"
				onPointerDown={(event) => {
					start.current = {
						y: event.clientY,
						rest,
						height: event.currentTarget.parentElement?.offsetHeight ?? 1,
					};
					event.currentTarget.setPointerCapture(event.pointerId);
					setDrag(rest);
				}}
				onPointerMove={(event) => {
					const from = start.current;
					if (!from) return;
					setDrag(Math.min(100, Math.max(0, from.rest + ((event.clientY - from.y) / from.height) * 100)));
				}}
				onPointerUp={() => {
					const at = drag ?? rest;
					start.current = null;
					setDrag(null);
					if (at > 72) onClose();
					else setRest(at < 22 ? 0 : SHEET_HALF);
				}}
			>
				<span className="bg-line-2 h-1 w-10 rounded-full" />
			</div>
			<PanelContext value={onClose}>
				<aside
					aria-label={m.inspector()}
					className="grid min-h-0 flex-1 content-start gap-6 overflow-auto px-5 pb-6 [scrollbar-width:thin] md:w-(--panel-w)"
				>
					{children}
				</aside>
			</PanelContext>
			{footer && (
				<div className="border-line grid gap-3.5 border-t px-5 pt-4 pb-5 md:w-(--panel-w)">{footer}</div>
			)}
		</div>
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
	/** The bar under the preview: zoom and the size of the picture. */
	status?: ReactNode;
	inspector: ReactNode;
	/** Sticks to the bottom of the inspector, for the final action of a panel. */
	inspectorFooter?: ReactNode;
}

/**
 * The shared layout of every editor: tools on the left, their panel beside them, the preview in
 * the middle with the timeline and a status bar below. On a phone the tools move to a bottom bar
 * within thumb reach and the panel becomes a sheet over the preview.
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
	status,
	inspector,
	inspectorFooter,
}: EditorLayoutProps) {
	const editor = EDITORS[kind];
	const task = useTask();
	// On a phone the sheet would hide the picture: it waits for a tool to be chosen.
	const [open, setOpen] = useState(() => !window.matchMedia('(max-width: 767.98px)').matches);
	const close = () => {
		setOpen(false);
	};
	// Choosing a tool opens its panel; choosing the open one again closes it.
	const select = (next: ToolId) => {
		if (open && next === tool) {
			setOpen(false);
			return;
		}
		setOpen(true);
		onTool(next);
	};
	const [dialog, setDialog] = useState<'palette' | 'help' | null>(null);
	const navigate = useNavigate();
	const [theme, toggleTheme] = useTheme();
	const zoomable = status !== undefined;

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
				event.preventDefault();
				setDialog('palette');
			} else if (event.key === '?' && !isTyping(event.target)) {
				event.preventDefault();
				setDialog('help');
			}
		};
		window.addEventListener('keydown', onKeyDown);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
		};
	}, []);

	const commands = (): Command[] => {
		const zoom = useStageZoom.getState();
		return [
			...(tools ?? editor.tools).map((id) => ({
				id: `tool-${id}`,
				label: TOOL_LABELS[id](),
				icon: TOOL_ICONS[id],
				run: () => {
					setOpen(true);
					onTool(id);
				},
			})),
			...(actions?.onExport
				? [{ id: 'export', label: m.export(), icon: Download, run: () => shownActions?.onExport?.() }]
				: []),
			...(actions
				? [
						{ id: 'undo', label: m.undo(), icon: Undo2, keys: 'Ctrl Z', run: actions.onUndo },
						{ id: 'redo', label: m.redo(), icon: Redo2, keys: 'Ctrl ⇧ Z', run: actions.onRedo },
					]
				: []),
			...(zoomable
				? [
						{
							id: 'zoom-in',
							label: m.zoom_in(),
							icon: ZoomIn,
							keys: '+',
							run: () => {
								zoom.zoomBy(1.25);
							},
						},
						{
							id: 'zoom-out',
							label: m.zoom_out(),
							icon: ZoomOut,
							keys: '−',
							run: () => {
								zoom.zoomBy(0.8);
							},
						},
						{
							id: 'zoom-fit',
							label: m.zoom_fit(),
							icon: Scan,
							keys: '0',
							run: () => {
								zoom.setZoom(null);
							},
						},
					]
				: []),
			...EDITOR_ORDER.filter((other) => other !== kind).map((other) => ({
				id: `editor-${other}`,
				label: EDITORS[other].page(),
				icon: MEDIA_ICONS[other],
				run: () => void navigate({ to: EDITORS[other].path }),
			})),
			{
				id: 'theme',
				label: theme === 'dark' ? m.theme_to_light() : m.theme_to_dark(),
				icon: theme === 'dark' ? Sun : Moon,
				run: toggleTheme,
			},
			{
				id: 'language',
				label: m.command_language(),
				icon: Languages,
				run: () => void setLocale(getLocale() === 'fr' ? 'en' : 'fr'),
			},
			{
				id: 'help',
				label: m.shortcut_help(),
				icon: Keyboard,
				keys: '?',
				run: () => {
					setDialog('help');
				},
			},
			{ id: 'home', label: m.command_home(), icon: House, run: () => void navigate({ to: '/' }) },
		];
	};

	const shortcuts = (): ShortcutGroup[] => [
		{
			title: m.shortcuts_general(),
			shortcuts: [
				[m.shortcut_search(), 'Ctrl K'],
				[m.shortcut_undo(), 'Ctrl Z'],
				[m.shortcut_redo(), 'Ctrl ⇧ Z'],
				[m.shortcut_reset(), m.shortcut_double_click()],
				[m.shortcut_help(), '?'],
			],
		},
		...(zoomable
			? [
					{
						title: m.shortcuts_view(),
						shortcuts: [
							[m.shortcut_zoom(), '+ −'],
							[m.shortcut_fit(), '0'],
							[m.shortcut_zoom_wheel(), `Ctrl ${m.shortcut_wheel()}`],
							[m.shortcut_pan(), m.shortcut_drag()],
							[m.shortcut_compare(), 'C'],
						] satisfies [string, string][],
					},
				]
			: []),
		...(editor.timed
			? [
					{
						title: m.shortcuts_playback(),
						shortcuts: [
							[m.shortcut_play(), m.key_space()],
							[m.shortcut_step(), '← →'],
							[m.shortcut_step_long(), '⇧ ← →'],
							[m.shortcut_ends(), m.key_home_end()],
							...(kind === 'gif'
								? []
								: ([
										[m.shortcut_trim(), 'I O'],
										[m.shortcut_cut(), m.key_delete()],
									] satisfies [string, string][])),
						] satisfies [string, string][],
					},
				]
			: []),
	];

	const shownActions = actions && {
		...actions,
		onExport:
			actions.onExport &&
			(() => {
				setOpen(true);
				actions.onExport?.();
			}),
	};

	return (
		<div
			data-media={kind}
			className="relative flex h-full min-h-0 flex-col overflow-hidden [--panel-w:clamp(19.5rem,23vw,27rem)] [--rail-w:clamp(4.75rem,5vw,5.75rem)]"
		>
			<AppBar
				editor={kind}
				fileName={fileName}
				actions={shownActions}
				onSearch={() => {
					setDialog('palette');
				}}
			/>
			{dialog === 'palette' && (
				<CommandPalette
					commands={commands()}
					onClose={() => {
						setDialog(null);
					}}
				/>
			)}
			{dialog === 'help' && (
				<ShortcutHelp
					groups={shortcuts()}
					onClose={() => {
						setDialog(null);
					}}
				/>
			)}
			<div
				className={`ease-out-soft grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto_auto] transition-[grid-template-columns] duration-300 max-md:grid-cols-1 md:grid-rows-[minmax(0,1fr)_auto_auto] ${open ? 'md:grid-cols-[var(--rail-w)_var(--panel-w)_minmax(0,1fr)]' : 'md:grid-cols-[var(--rail-w)_0px_minmax(0,1fr)]'}`}
			>
				<div className="z-30 max-md:order-4 md:row-span-3">
					<Rail tools={tools ?? editor.tools} current={tool} open={open} onSelect={select} />
				</div>
				<div className="contents md:row-span-3 md:block md:min-h-0">
					<Panel open={open} onClose={close} footer={inspectorFooter}>
						{inspector}
					</Panel>
				</div>
				{/* Laid out by the grid around it, as if it weren't there. */}
				<main className="contents">
					<h1 className="sr-only">{task ? task.title() : editor.page()}</h1>
					{workspace ? (
						<section
							aria-label={m.preview()}
							className="bg-canvas min-h-0 min-w-0 overflow-hidden max-md:order-1 md:row-span-3"
						>
							{workspace}
						</section>
					) : (
						<>
							<section
								aria-label={m.preview()}
								className="bg-canvas relative min-h-0 min-w-0 overflow-hidden max-md:order-1"
							>
								{/* A box with a definite size, so the media can be contained in it whatever its resolution. */}
								<div className="absolute inset-4 flex items-center justify-center md:inset-8">
									{viewer}
								</div>
							</section>
							<div className="min-w-0 max-md:order-2">{timeline}</div>
							{status && (
								<div
									data-status
									className="border-line bg-bg flex h-14 min-w-0 items-center gap-1.5 border-t px-4 max-md:hidden"
								>
									{status}
								</div>
							)}
						</>
					)}
				</main>
			</div>
		</div>
	);
}

/** The panel's heading, with an optional action (reset) and the button closing the panel. */
export function PanelTitle({ children, action }: { children: string; action?: ReactNode }) {
	const close = use(PanelContext);
	return (
		<div className="bg-bg sticky top-0 z-10 -mx-5 -mb-2 flex items-center gap-2 px-5 pt-5 pb-2 max-md:pt-1">
			<h2 className="text-title flex-1 font-[650] tracking-[-0.02em]">{children}</h2>
			{action}
			{close && (
				<IconButton label={m.close_panel()} onClick={close}>
					<X className="size-5" />
				</IconButton>
			)}
		</div>
	);
}
