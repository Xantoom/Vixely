import { Link } from '@tanstack/react-router';
import { Download, MonitorDown, Moon, Redo2, RefreshCw, Search, Sun, Undo2 } from 'lucide-react';
import type { MediaKind } from '@/editors/registry';
import { m } from '@/paraglide/messages.js';
import { getLocale, setLocale } from '@/paraglide/runtime.js';
import { Button, IconButton } from '@/ui/Button';
import { LogoMark } from '@/ui/Logo';
import { EditorSwitcher } from './EditorSwitcher';
import { applyUpdate, install, usePwa } from './pwa';
import { useTheme } from './theme';

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
	/** Set inside an editor: shows the switcher, the file name and the editing actions. */
	editor?: MediaKind;
	fileName?: string;
	actions?: EditorActions;
	/** Opens the search of actions (Ctrl or ⌘ + K). */
	onSearch?: () => void;
}

/** Switches between English and French; the page reloads in the other language. */
export function LanguageButton() {
	const next = getLocale() === 'fr' ? 'en' : 'fr';
	return (
		<button
			type="button"
			lang={next}
			aria-label={next === 'fr' ? 'Français' : 'English'}
			title={next === 'fr' ? 'Français' : 'English'}
			onClick={() => {
				void setLocale(next);
			}}
			className="text-ui text-ink-2 hover:bg-surface hover:text-ink grid h-10 min-w-10 place-items-center rounded-sm px-2 font-mono font-medium uppercase transition-colors"
		>
			{next}
		</button>
	);
}

export function AppBar({ editor, fileName, actions, onSearch }: AppBarProps) {
	const [theme, toggleTheme] = useTheme();
	const updateReady = usePwa((state) => state.updateReady);
	const installable = usePwa((state) => state.installable);

	return (
		<header
			className={`border-line bg-bg relative flex h-15 flex-none items-center gap-2 border-b pr-4 pl-4.5 ${editor ? 'z-30' : ''}`}
		>
			<Link
				to="/"
				aria-label={m.app_home()}
				className="hover:bg-surface -ml-1.5 flex h-10 items-center gap-2.5 rounded-sm px-1.5 transition-colors"
			>
				<LogoMark size={30} />
				<span className={`text-lead font-bold tracking-[-0.03em] ${editor ? 'max-md:hidden' : ''}`}>
					Vixely
				</span>
			</Link>

			{editor && (
				<>
					<div className="ml-1.5">
						<EditorSwitcher current={editor} />
					</div>
					{fileName && <span className="text-ui text-muted ml-1.5 truncate max-md:hidden">{fileName}</span>}
				</>
			)}

			<div className="flex-1" />

			{onSearch && (
				<button
					type="button"
					onClick={onSearch}
					className="text-ui text-muted bg-surface hover:bg-surface-2 mr-1 flex h-10 min-w-56 items-center gap-2.5 rounded-sm px-3 transition-colors max-lg:hidden"
				>
					<Search className="size-[1.1rem]" aria-hidden="true" />
					<span className="flex-1 text-left">{m.command_search()}</span>
					<kbd className="text-caption rounded-[0.35rem] px-1.5 py-0.5 font-mono shadow-[inset_0_0_0_1px_var(--line-2)]">
						Ctrl K
					</kbd>
				</button>
			)}

			{editor && (
				<div className="mr-1.5 flex gap-0.5">
					<IconButton label={m.undo()} disabled={!actions?.canUndo} onClick={actions?.onUndo}>
						<Undo2 className="size-5" />
					</IconButton>
					<IconButton label={m.redo()} disabled={!actions?.canRedo} onClick={actions?.onRedo}>
						<Redo2 className="size-5" />
					</IconButton>
				</div>
			)}

			{/* On a phone, the editor keeps its room for undo and export; both are on every other page. */}
			<div className={`flex gap-2 ${editor ? 'max-sm:hidden' : ''}`}>
				{updateReady && (
					<IconButton label={m.app_update()} onClick={applyUpdate}>
						<RefreshCw className="size-5" />
					</IconButton>
				)}
				{installable && !editor && (
					<IconButton
						label={m.app_install()}
						onClick={() => {
							void install();
						}}
					>
						<MonitorDown className="size-5" />
					</IconButton>
				)}
				<LanguageButton />
				<IconButton label={theme === 'dark' ? m.theme_to_light() : m.theme_to_dark()} onClick={toggleTheme}>
					{theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
				</IconButton>
			</div>

			{editor && (
				<Button
					variant="primary"
					className="ml-1"
					disabled={!actions?.onExport}
					title={actions?.onExport ? undefined : m.export_later()}
					aria-pressed={actions?.exportActive}
					onClick={actions?.onExport}
				>
					<Download className="size-5" aria-hidden="true" />
					<span className="max-sm:sr-only">{m.export()}</span>
				</Button>
			)}

			{editor && <span className="bg-ed-line absolute inset-x-0 -bottom-px h-[3px]" aria-hidden="true" />}
		</header>
	);
}
