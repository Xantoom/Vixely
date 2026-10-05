import { Link } from '@tanstack/react-router';
import { MonitorDown, Redo2, RefreshCw, Search, Undo2 } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { EDITOR_ORDER, EDITORS, type MediaKind } from '@/editors/registry';
import { m } from '@/paraglide/messages.js';
import { IconButton } from '@/ui/Button';
import { MEDIA_ICONS } from '@/ui/icons';
import { LogoMark } from '@/ui/Logo';
import { EditorSwitcher } from './EditorSwitcher';
import { FileMenu } from './FileMenu';
import { applyUpdate, install, usePwa } from './pwa';
import { LanguageMenu, ThemeMenu } from './SettingsMenus';

export interface EditorActions {
	canUndo: boolean;
	canRedo: boolean;
	onUndo: () => void;
	onRedo: () => void;
	/** Opens the export settings. Absent while the editor has no export yet. */
	onExport?: () => void;
	exportActive?: boolean;
}

interface AppBarProps {
	/** Set inside an editor: shows the editors, the file name and the editing actions. */
	editor?: MediaKind;
	fileName?: string;
	actions?: EditorActions;
	/** Opens the search of actions (Ctrl or ⌘ + K). */
	onSearch?: () => void;
	/** The editor just left for this one, if any: the bar shows the move. */
	from?: MediaKind | null;
}

/**
 * The five editors side by side, the open one marked in its colour: one click to another. Coming
 * from another editor, the mark slides over from its tab.
 */
function EditorTabs({ current, from }: { current: MediaKind; from: MediaKind | null }) {
	const nav = useRef<HTMLElement>(null);
	const mark = useRef<HTMLSpanElement>(null);
	useLayoutEffect(() => {
		const highlight = mark.current;
		const previous = from && nav.current?.querySelector<HTMLElement>(`[data-media="${from}"]`);
		if (!highlight || !previous || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		const target = highlight.getBoundingClientRect();
		const start = previous.getBoundingClientRect();
		// Moved and stretched, both drawn by the compositor: smooth even while the editor opens.
		const animation = highlight.animate(
			[
				{ transform: `translateX(${start.left - target.left}px) scaleX(${start.width / target.width})` },
				{ transform: 'none' },
			],
			{ duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
		);
		return () => {
			animation.cancel();
		};
	}, [from]);
	return (
		<nav ref={nav} aria-label={m.switch_editor()} className="bg-surface flex gap-0.5 rounded-md p-0.5">
			{EDITOR_ORDER.map((kind) => {
				const Icon = MEDIA_ICONS[kind];
				return (
					<Link
						key={kind}
						to={EDITORS[kind].path}
						data-media={kind}
						aria-current={kind === current ? 'page' : undefined}
						title={EDITORS[kind].label()}
						className="group text-ui text-muted hover:text-ink aria-[current=page]:text-ink relative flex h-8 items-center gap-2 rounded-[0.45rem] px-3 font-medium transition-colors duration-150 max-xl:px-2.5"
					>
						{kind === current && (
							// Under every tab's words, its own and the others' it slides past.
							<span
								ref={mark}
								aria-hidden="true"
								className="bg-bg absolute inset-0 z-0 origin-left rounded-[0.45rem] shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_var(--line)]"
							/>
						)}
						<Icon
							className="group-aria-[current=page]:text-ed-text relative z-1 size-4 flex-none"
							strokeWidth={2}
							aria-hidden="true"
						/>
						<span className="relative z-1 max-xl:sr-only">{EDITORS[kind].label()}</span>
					</Link>
				);
			})}
		</nav>
	);
}

export function AppBar({ editor, fileName, actions, onSearch, from = null }: AppBarProps) {
	const updateReady = usePwa((state) => state.updateReady);
	const installable = usePwa((state) => state.installable);

	return (
		<header
			className={`border-line bg-bg relative grid h-13 flex-none grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] max-md:grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-3 ${editor ? 'z-30' : ''}`}
		>
			<div className="flex min-w-0 items-center gap-1">
				<Link
					to="/"
					aria-label={m.app_home()}
					title={m.app_home()}
					className="hover:bg-surface grid size-9 flex-none place-items-center rounded-sm transition-colors"
				>
					<LogoMark size={26} />
				</Link>
				{editor && (
					<>
						<span className="md:hidden">
							<EditorSwitcher current={editor} />
						</span>
						{actions && (
							<span className="ml-0.5 flex min-w-0">
								<FileMenu editor={editor} fileName={fileName} unsaved={actions.canUndo} />
							</span>
						)}
					</>
				)}
			</div>

			<div className="max-md:hidden">{editor && <EditorTabs current={editor} from={from} />}</div>

			<div className="flex items-center justify-end gap-0.5">
				{editor && (
					<>
						<IconButton label={m.undo()} disabled={!actions?.canUndo} onClick={actions?.onUndo}>
							<Undo2 className="size-[1.15rem]" />
						</IconButton>
						<IconButton label={m.redo()} disabled={!actions?.canRedo} onClick={actions?.onRedo}>
							<Redo2 className="size-[1.15rem]" />
						</IconButton>
						<span className="bg-line mx-1.5 h-5 w-px max-sm:hidden" aria-hidden="true" />
					</>
				)}
				{onSearch && (
					<IconButton label={`${m.search_list()} (Ctrl K)`} onClick={onSearch} className="max-sm:hidden">
						<Search className="size-[1.15rem]" />
					</IconButton>
				)}
				<div className={`flex gap-0.5 ${editor ? 'max-sm:hidden' : ''}`}>
					{updateReady && (
						<IconButton label={m.app_update()} onClick={applyUpdate}>
							<RefreshCw className="size-[1.15rem]" />
						</IconButton>
					)}
					{installable && !editor && (
						<IconButton
							label={m.app_install()}
							onClick={() => {
								void install();
							}}
						>
							<MonitorDown className="size-[1.15rem]" />
						</IconButton>
					)}
					<LanguageMenu />
					<ThemeMenu />
				</div>
			</div>
		</header>
	);
}
