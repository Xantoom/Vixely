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
import {
	createContext,
	Fragment,
	type ReactNode,
	use,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from 'react';
import { AppBar, type EditorActions } from '@/app/AppBar';
import { changeLocale, LOCALE_NAMES } from '@/app/locale';
import { useTask } from '@/app/task-context';
import { setThemeMode, useTheme } from '@/app/theme';
import { EDITOR_ORDER, EDITORS, type MediaKind, TOOL_LABELS, type ToolId } from '@/editors/registry';
import { m } from '@/paraglide/messages.js';
import { getLocale, locales } from '@/paraglide/runtime.js';
import { IconButton } from '@/ui/Button';
import { MEDIA_ICONS, TOOL_ICONS } from '@/ui/icons';
import { type Command, CommandPalette, type ShortcutGroup, ShortcutHelp } from './CommandPalette';
import { isTyping } from './shortcuts';
import { useStageZoom } from './ZoomStage';

/** Lets the panel's own title close the panel. */
const PanelContext = createContext<(() => void) | null>(null);
/** False where a panel shows under a heading of its own, such as a tab: its title is left out. */
export const PanelTitles = createContext(true);

/**
 * Which ends of a scrolling row or column have more beyond them, to fade those edges: the cue that
 * the tools go on past the screen.
 */
function useOverflowEdges<T extends HTMLElement>() {
	const ref = useRef<T>(null);
	const [edges, setEdges] = useState({ start: false, end: false });
	useEffect(() => {
		const element = ref.current;
		if (!element) return;
		const measure = () => {
			const across = element.scrollWidth > element.clientWidth + 1;
			const position = across ? element.scrollLeft : element.scrollTop;
			const room = across
				? element.scrollWidth - element.clientWidth
				: element.scrollHeight - element.clientHeight;
			setEdges({ start: room > 1 && position > 1, end: room > 1 && position < room - 1 });
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		element.addEventListener('scroll', measure, { passive: true });
		return () => {
			observer.disconnect();
			element.removeEventListener('scroll', measure);
		};
	}, []);
	return { ref, edges };
}

function Rail({
	tools,
	current,
	open,
	onSelect,
	exportable,
	disabled,
}: {
	tools: ToolId[];
	current: ToolId;
	open: boolean;
	onSelect: (tool: ToolId) => void;
	/** Before a file is open: the tools show what the editor does, and wait for it. */
	disabled: boolean;
	/** Export sits at the end of the rail, apart, once the file can be exported. */
	exportable: boolean;
}) {
	const { ref, edges } = useOverflowEdges<HTMLDivElement>();
	const fade = (edge: 'start' | 'end') => (edges[edge] ? 'transparent' : '#000');
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
	}, [current, open, tools, exportable, ref]);
	const moved = useRef(false);
	useEffect(() => {
		moved.current = mark !== null;
	}, [mark]);
	return (
		<nav
			aria-label={m.editing_tools()}
			className="border-line bg-bg max-md:border-t max-md:pb-[env(safe-area-inset-bottom,0px)] md:h-full md:border-r"
		>
			<div
				ref={ref}
				style={{ '--fade-start': fade('start'), '--fade-end': fade('end') }}
				className="relative flex gap-1 [scrollbar-width:none] max-md:overflow-x-auto max-md:px-1.5 max-md:py-1.5 max-md:[mask-image:linear-gradient(90deg,var(--fade-start),#000_2.5rem,#000_calc(100%-2.5rem),var(--fade-end))] md:h-full md:flex-col md:items-stretch md:overflow-y-auto md:px-2 md:py-3 md:[mask-image:linear-gradient(180deg,var(--fade-start),#000_2.5rem,#000_calc(100%-2.5rem),var(--fade-end))]"
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
				{[
					...tools.filter((tool) => tool !== 'export'),
					...(exportable || tools.includes('export') ? (['export'] as const) : []),
				].map((tool) => {
					const Icon = TOOL_ICONS[tool];
					const pressed = open && tool === current;
					const last = tool === 'export';
					return (
						<Fragment key={tool}>
							{last && (
								<span
									aria-hidden="true"
									className="separator max-md:hidden md:mx-2 md:my-1.5 md:mt-auto"
								/>
							)}
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
								className={`group text-caption enabled:hover:bg-surface enabled:hover:text-ink disabled:opacity-40 aria-pressed:text-ed-text relative grid min-w-15 aria-pressed:hover:bg-transparent flex-1 justify-items-center gap-1.5 rounded-md px-1 pt-3 pb-2.5 font-medium transition-colors duration-200 md:flex-none ${last ? 'text-ed-text' : 'text-muted'}`}
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
	tool,
	onSheet,
}: {
	open: boolean;
	onClose: () => void;
	children: ReactNode;
	footer?: ReactNode;
	/** Each tool keeps its own scroll position; one never scrolled starts at the top. */
	tool: ToolId;
	/** Where the sheet's top comes to rest, from the top of the editor, in pixels; null when closed. */
	onSheet: (top: number | null) => void;
}) {
	const scrolls = useRef(new Map<ToolId, number>());
	const asideRef = useRef<HTMLElement>(null);
	useLayoutEffect(() => {
		const aside = asideRef.current;
		if (aside) aside.scrollTop = scrolls.current.get(tool) ?? 0;
	}, [tool]);
	const [rest, setRest] = useState(SHEET_HALF);
	const [drag, setDrag] = useState<number | null>(null);
	const start = useRef<{ y: number; rest: number; height: number } | null>(null);
	useEffect(() => {
		if (open) setRest(SHEET_HALF);
	}, [open]);
	const hidden = drag ?? rest;
	const sheetRef = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		const sheet = sheetRef.current;
		// Measured without its transform: where it will be once it has slid there.
		onSheet(open && sheet ? sheet.offsetTop + (sheet.offsetHeight * hidden) / 100 : null);
	}, [open, hidden, onSheet]);
	return (
		<div
			ref={sheetRef}
			data-open={open}
			style={{ '--sheet': `${open ? hidden : 105}%` }}
			className={`border-line bg-bg flex min-h-0 flex-col overflow-hidden md:h-full max-md:absolute max-md:inset-x-0 max-md:bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] max-md:z-20 max-md:h-[82%] max-md:translate-y-(--sheet) max-md:rounded-t-[1.25rem] max-md:shadow-[0_-12px_40px_-12px_rgb(0_0_0/0.35)] md:border-r ${drag === null ? 'ease-spring transition-transform duration-[340ms]' : ''}`}
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
					key={tool}
					ref={asideRef}
					aria-label={m.inspector()}
					onScroll={(event) => {
						scrolls.current.set(tool, event.currentTarget.scrollTop);
					}}
					className="panel-in grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] auto-rows-max content-start gap-6 overflow-auto px-5 pb-6 md:w-(--panel-w)"
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
	/** Null before a file is open: there is nothing to show in it yet. */
	inspector: ReactNode | null;
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
	const [panelOpen, setOpen] = useState(() => !window.matchMedia('(max-width: 767.98px)').matches);
	const open = panelOpen && inspector !== null;
	// On a phone, the picture moves up to the room the sheet leaves it, rather than hiding under it.
	const previewRef = useRef<HTMLElement>(null);
	const [cover, setCover] = useState(0);
	const onSheet = useCallback((top: number | null) => {
		const preview = previewRef.current;
		const phone = window.matchMedia('(max-width: 767.98px)').matches;
		if (top === null || !preview || !phone) {
			setCover(0);
			return;
		}
		// A strip of the picture stays when the sheet is pulled up to the top.
		setCover(Math.min(preview.offsetHeight - 96, Math.max(0, preview.offsetTop + preview.offsetHeight - top)));
	}, []);
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
	const { mode: themeMode } = useTheme();
	const zoomable = status !== undefined;

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
				className={`ease-out-soft grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto_auto] transition-[grid-template-columns] duration-300 max-md:grid-cols-1 md:grid-rows-[minmax(0,1fr)_auto_auto] ${open ? 'md:grid-cols-[var(--rail-w)_var(--panel-w)_minmax(0,1fr)]' : 'md:grid-cols-[var(--rail-w)_0px_minmax(0,1fr)]'}`}
			>
				<div className="z-30 max-md:order-4 md:row-span-3">
					<Rail
						tools={tools ?? editor.tools}
						current={tool}
						open={open}
						onSelect={select}
						exportable={Boolean(actions?.onExport)}
						disabled={inspector === null}
					/>
				</div>
				<div className="contents md:row-span-3 md:block md:min-h-0">
					<Panel open={open} onClose={close} footer={inspectorFooter} tool={tool} onSheet={onSheet}>
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
								ref={previewRef}
								aria-label={m.preview()}
								className="bg-canvas relative min-h-0 min-w-0 overflow-hidden max-md:order-1"
							>
								{/* A box with a definite size, so the media can be contained in it whatever its resolution. */}
								<div
									style={cover > 0 ? { bottom: cover + 16 } : undefined}
									className="ease-spring absolute inset-4 flex items-center justify-center transition-[bottom] duration-[340ms] md:inset-8"
								>
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
	if (!use(PanelTitles)) return null;
	return (
		<div className="bg-bg sticky top-0 z-10 -mx-5 -mb-2 flex items-center gap-2 px-5 pt-5 pb-3 max-md:pt-1">
			<span aria-hidden="true" className="separator absolute inset-x-5 bottom-0" />
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
