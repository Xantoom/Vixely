import { useNavigate } from '@tanstack/react-router';
import {
	Download,
	House,
	Keyboard,
	Languages,
	Monitor,
	Moon,
	Redo2,
	Scan,
	Sun,
	Undo2,
	X,
	ZoomIn,
	ZoomOut,
} from 'lucide-react';
import { createContext, Fragment, type ReactNode, use, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppBar, type EditorActions } from '@/app/AppBar';
import { changeLocale, LOCALE_NAMES } from '@/app/locale';
import { useTask } from '@/app/task-context';
import { setThemeMode, useTheme } from '@/app/theme';
import { EDITOR_ORDER, EDITORS, type MediaKind, TOOL_LABELS, type ToolId } from '@/editors/registry';
import { m } from '@/paraglide/messages.js';
import { getLocale, locales } from '@/paraglide/runtime.js';
import { IconButton } from '@/ui/Button';
import { MEDIA_ICONS, TOOL_ICONS } from '@/ui/icons';
import { fadeMask, useOverflowEdges } from '@/ui/use-overflow-edges';
import { Ambient } from './Ambient';
import { type Command, CommandPalette, type ShortcutGroup, ShortcutHelp } from './CommandPalette';
import { isTyping } from './shortcuts';
import { useStageZoom } from './ZoomStage';

/** Lets the panel's own title close the panel. */
const PanelContext = createContext<(() => void) | null>(null);
/** False where a panel shows under a heading of its own, such as a tab: its title is left out. */
export const PanelTitles = createContext(true);

function Rail({
	tools,
	current,
	open,
	onSelect,
	disabled,
	exportable,
}: {
	/** The editing tools, export apart: it ends the rail, set off from them. */
	tools: ToolId[];
	current: ToolId;
	open: boolean;
	onSelect: (tool: ToolId) => void;
	/** Before a file is open: the tools show what the editor does, and wait for it. */
	disabled: boolean;
	/** False while the file can't be exported yet (still being read). */
	exportable: boolean;
}) {
	const { ref, edges } = useOverflowEdges<HTMLDivElement>();
	// The highlight behind the chosen tool slides from one tool to the next.
	const [mark, setMark] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
	const pressedRef = useRef<HTMLButtonElement | null>(null);
	useLayoutEffect(() => {
		const measure = () => {
			const button = pressedRef.current;
			setMark(
				button && open
					? {
							x: button.offsetLeft,
							y: button.offsetTop,
							width: button.offsetWidth,
							height: button.offsetHeight,
						}
					: null,
			);
		};
		measure();
		const container = ref.current;
		if (!container) return;
		const observer = new ResizeObserver(measure);
		observer.observe(container);
		return () => {
			observer.disconnect();
		};
	}, [current, open, tools, ref]);
	const moved = useRef(false);
	useEffect(() => {
		moved.current = mark !== null;
	}, [mark]);
	return (
		<nav
			aria-label={m.editing_tools()}
			className="border-line bg-bg flex max-md:border-t max-md:pb-[env(safe-area-inset-bottom,0px)] md:h-full md:flex-col md:border-r"
		>
			<div
				ref={ref}
				style={{ '--fade-x': fadeMask(edges, 'x'), '--fade-y': fadeMask(edges, 'y') }}
				className="relative flex min-h-0 min-w-0 flex-1 gap-1 [scrollbar-width:none] max-md:overflow-x-auto max-md:px-1.5 max-md:py-1.5 max-md:[mask-image:var(--fade-x)] md:h-full md:flex-col md:items-stretch md:overflow-y-auto md:px-2 md:py-3 md:[mask-image:var(--fade-y)]"
			>
				<span
					aria-hidden="true"
					className={`bg-ed-soft pointer-events-none absolute top-0 left-0 rounded-md ${moved.current ? 'ease-spring transition-[transform,width,height,opacity] duration-300' : ''} ${mark ? 'opacity-100' : 'opacity-0'}`}
					style={
						mark
							? {
									transform: `translate(${mark.x}px, ${mark.y}px)`,
									width: mark.width,
									height: mark.height,
								}
							: undefined
					}
				/>
				{tools.map((tool) => {
					const Icon = TOOL_ICONS[tool];
					const pressed = open && tool === current;
					return (
						<Fragment key={tool}>
							<button
								ref={
									pressed
										? (element) => {
												pressedRef.current = element;
											}
										: undefined
								}
								type="button"
								disabled={disabled}
								aria-pressed={pressed}
								onClick={(event) => {
									onSelect(tool);
									event.currentTarget.scrollIntoView({
										block: 'nearest',
										inline: 'nearest',
										behavior: 'smooth',
									});
								}}
								className={`group text-caption enabled:hover:bg-surface enabled:hover:text-ink disabled:opacity-40 aria-pressed:text-ed-text relative grid min-w-15 aria-pressed:hover:bg-transparent flex-1 justify-items-center gap-1.5 rounded-md px-1 pt-3 pb-2.5 font-medium text-muted transition-colors duration-200 md:flex-none`}
							>
								<Icon
									strokeWidth={1.75}
									aria-hidden="true"
									className="ease-spring size-[1.4rem] transition-transform duration-300 group-hover:-translate-y-px"
								/>
								<span>{TOOL_LABELS[tool]()}</span>
							</button>
						</Fragment>
					);
				})}
			</div>
			<span className="bg-line flex-none max-md:my-2.5 max-md:w-px md:mx-3 md:my-2 md:h-px" aria-hidden="true" />
			<button
				type="button"
				disabled={disabled || !exportable}
				title={exportable ? undefined : m.export_later()}
				aria-pressed={open && current === 'export'}
				onClick={() => {
					onSelect('export');
				}}
				className="group text-caption text-ed-text enabled:hover:bg-ed-soft aria-pressed:bg-ed-soft relative m-1.5 grid min-w-15 flex-none md:mx-2 md:mt-0 md:mb-3 justify-items-center gap-1.5 rounded-md px-1 pt-2.5 pb-2.5 font-semibold transition-colors duration-200 disabled:opacity-40"
			>
				<span className="bg-ed text-ed-ink ease-spring grid size-8 place-items-center rounded-sm transition-transform duration-300 group-enabled:group-hover:-translate-y-px">
					<Download strokeWidth={2} aria-hidden="true" className="size-[1.1rem]" />
				</span>
				<span>{TOOL_LABELS.export()}</span>
			</button>
		</nav>
	);
}

/**
 * The inspector: a panel beside the rail on larger screens, which the rail opens and closes; on a
 * phone, the space under the picture, as below a video in a player app.
 */
function Panel({
	open,
	onClose,
	children,
	footer,
	tool,
}: {
	open: boolean;
	onClose: () => void;
	children: ReactNode;
	footer?: ReactNode;
	/** Each tool keeps its own scroll position; one never scrolled starts at the top. */
	tool: ToolId;
}) {
	const scrolls = useRef(new Map<ToolId, number>());
	const asideRef = useRef<HTMLElement>(null);
	useLayoutEffect(() => {
		const aside = asideRef.current;
		if (aside) aside.scrollTop = scrolls.current.get(tool) ?? 0;
	}, [tool]);
	return (
		<div
			data-open={open}
			// Folded away, nothing in it can be reached by the keyboard or clicked.
			inert={!open}
			className={`border-line bg-bg flex h-full min-h-0 flex-col overflow-hidden max-md:border-t md:border-r ${open ? '' : 'max-md:hidden'}`}
		>
			<PanelContext value={onClose}>
				<aside
					key={tool}
					ref={asideRef}
					aria-label={m.inspector()}
					onScroll={(event) => {
						scrolls.current.set(tool, event.currentTarget.scrollTop);
					}}
					className="panel-in grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] auto-rows-max content-start gap-5 overflow-auto overscroll-contain px-5 pb-6 md:w-(--panel-w) [&>section]:-mx-5 [&>section]:px-5 [&>[data-panel-title]+section]:border-t-0 [&>[data-panel-title]+section]:pt-0"
				>
					{children}
				</aside>
			</PanelContext>
			{footer && (
				<div className="border-line grid gap-3.5 border-t px-5 pt-4 pb-5 max-md:pt-3 max-md:pb-3 md:w-(--panel-w)">
					{footer}
				</div>
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
	/** The bar along the bottom of the preview: zoom, the size of the picture, the comparison. */
	status?: ReactNode;
	/**
	 * Width over height of the picture shown. On a phone the picture spans the screen's width at
	 * the top, as in a video app, and this sets its height.
	 */
	aspect?: number;
	/** The preview ends with a player's bar (play, time, position), under the picture. */
	player?: boolean;
	/** Null before a file is open: there is nothing to show in it yet. */
	inspector: ReactNode | null;
	/** Sticks to the bottom of the inspector, for the final action of a panel. */
	inspectorFooter?: ReactNode;
	/** Whether the panel starts open; editors whose workspace needs the room start with it closed. */
	panelOpenAtStart?: boolean;
	/** A picture of the file, blurred behind the preview. */
	ambient?: ImageBitmap | null;
}

/**
 * The shared layout of every editor: tools on the left, their panel beside them, the preview in
 * the middle with its bar of zoom along its bottom, and the timeline below. On a phone, as in a
 * video app: the picture spans the width at the top, the timeline and the tool's settings follow,
 * and the tools sit in a bottom bar within thumb reach.
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
	aspect,
	player = false,
	inspector,
	inspectorFooter,
	panelOpenAtStart = true,
	ambient = null,
}: EditorLayoutProps) {
	const editor = EDITORS[kind];
	const task = useTask();
	// Open from the start, on a phone too: there it sits under the picture, as a video's details do.
	const [panelOpen, setOpen] = useState(panelOpenAtStart);
	const open = panelOpen && inspector !== null;
	const close = () => {
		setOpen(false);
	};
	// A tool chosen otherwise than on the rail, by a shortcut or a link, opens its panel too.
	const shownTool = useRef(tool);
	useEffect(() => {
		if (shownTool.current === tool) return;
		shownTool.current = tool;
		setOpen(true);
	}, [tool]);
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
	const { mode: themeMode } = useTheme();
	const zoomable = status !== undefined;
	// On a phone the picture spans the width at the height its shape needs, as in a video app's
	// player, rather than filling the screen between black bars.
	const sized = aspect !== undefined && Number.isFinite(aspect) && aspect > 0;
	// On a phone, from the top: the preview (or workspace), the timeline, the open panel, the tools.
	const phoneRows = workspace
		? open
			? 'max-md:grid-rows-[auto_minmax(0,1fr)_auto]'
			: 'max-md:grid-rows-[minmax(0,1fr)_auto]'
		: open
			? 'max-md:grid-rows-[auto_auto_minmax(0,1fr)_auto]'
			: sized
				? 'max-md:grid-rows-[auto_minmax(0,1fr)_auto]'
				: 'max-md:grid-rows-[minmax(0,1fr)_auto_auto]';

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !isTyping(null)) {
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
			...(
				[
					['light', m.theme_light(), Sun],
					['dark', m.theme_dark(), Moon],
					['system', m.theme_system(), Monitor],
				] as const
			)
				.filter(([id]) => id !== themeMode)
				.map(([id, name, icon]) => ({
					id: `theme-${id}`,
					label: m.command_theme({ name }),
					icon,
					run: () => {
						setThemeMode(id);
					},
				})),
			...locales
				.filter((locale) => locale !== getLocale())
				.map((locale) => ({
					id: `language-${locale}`,
					label: LOCALE_NAMES[locale],
					icon: Languages,
					run: () => {
						changeLocale(locale);
					},
				})),
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
							[m.shortcut_zoom_wheel(), m.shortcut_wheel()],
							[m.shortcut_pan_wheel(), `⇧ ${m.shortcut_wheel()}`],
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
				style={{ '--stage-h': stageHeight(aspect, player, open) }}
				className={`ease-out-soft grid min-h-0 flex-1 grid-cols-1 transition-[grid-template-columns] duration-300 md:grid-rows-[minmax(0,1fr)_auto] ${phoneRows} ${open ? 'md:grid-cols-[var(--rail-w)_var(--panel-w)_minmax(0,1fr)]' : 'md:grid-cols-[var(--rail-w)_0px_minmax(0,1fr)]'}`}
			>
				<div className="z-30 max-md:order-4 md:row-span-2">
					<Rail
						tools={(tools ?? editor.tools).filter((id) => id !== 'export')}
						current={tool}
						open={open}
						onSelect={(next) => {
							if (next === 'export' && !(open && tool === 'export')) shownActions?.onExport?.();
							else select(next);
						}}
						disabled={inspector === null}
						exportable={Boolean(actions?.onExport)}
					/>
				</div>
				<div className="min-h-0 max-md:order-3 md:row-span-2">
					<Panel open={open} onClose={close} footer={inspectorFooter} tool={tool}>
						{inspector}
					</Panel>
				</div>
				{/* Laid out by the grid around it, as if it weren't there. */}
				<main className="contents">
					<h1 className="sr-only">{task ? task.title() : editor.page()}</h1>
					{workspace ? (
						<section
							aria-label={m.preview()}
							className={`bg-canvas min-h-0 min-w-0 overflow-hidden max-md:order-1 md:row-span-2 ${open ? 'max-md:h-[45svh]' : ''}`}
						>
							{workspace}
						</section>
					) : (
						<>
							<section
								aria-label={m.preview()}
								className={`bg-canvas relative flex min-h-0 min-w-0 flex-col overflow-hidden max-md:order-1 ${open || sized ? 'max-md:h-(--stage-h)' : ''}`}
							>
								{ambient && <Ambient bitmap={ambient} />}
								{/* A box with a definite size, so the media can be contained in it whatever its resolution. */}
								<div className="relative min-h-0 flex-1">
									<div
										className={`absolute flex items-center justify-center md:inset-x-6 md:top-6 ${status || player ? 'md:bottom-3' : 'md:bottom-6'} ${player ? 'max-md:inset-x-0 max-md:top-0 max-md:bottom-2' : 'max-md:inset-0'}`}
									>
										{viewer}
									</div>
								</div>
								{status && (
									<div
										data-status
										className="relative flex h-13 min-w-0 flex-none items-center gap-1 px-4 max-md:hidden"
									>
										{status}
									</div>
								)}
							</section>
							<div className="min-w-0 max-md:order-2 max-md:self-start">{timeline}</div>
						</>
					)}
				</main>
			</div>
		</div>
	);
}

/**
 * How tall the preview is on a phone: the picture at the full width of the screen, and its
 * player's bar, up to half the screen for tall pictures while a tool is open below it.
 */
function stageHeight(aspect: number | undefined, player: boolean, open: boolean): string {
	if (!aspect || !Number.isFinite(aspect) || aspect <= 0) return '40svh';
	return `min(calc(100vw / ${aspect.toFixed(4)}${player ? ' + 5.5rem' : ''}), ${open ? 50 : 70}svh)`;
}

/** The panel's heading, with an optional action (reset) and the button closing the panel. */
export function PanelTitle({ children, action }: { children: string; action?: ReactNode }) {
	const close = use(PanelContext);
	if (!use(PanelTitles)) return null;
	return (
		<div
			data-panel-title
			className="bg-bg border-line sticky top-0 z-10 -mx-5 -mb-1 flex h-14 flex-none items-center gap-1 border-b pr-3 pl-5 max-md:h-12"
		>
			<h2 className="text-lead flex-1 font-semibold tracking-[-0.015em]">{children}</h2>
			{action}
			{close && (
				<IconButton label={m.close_panel()} onClick={close}>
					<X className="size-5" />
				</IconButton>
			)}
		</div>
	);
}
