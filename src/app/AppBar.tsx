import { Link } from '@tanstack/react-router';
import { Moon, Redo2, Sun, Undo2 } from 'lucide-react';
import type { MediaKind } from '@/editors/registry';
import { m } from '@/paraglide/messages.js';
import { Button, IconButton } from '@/ui/Button';
import { LogoMark } from '@/ui/Logo';
import { EditorSwitcher } from './EditorSwitcher';
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
}

export function AppBar({ editor, fileName, actions }: AppBarProps) {
	const [theme, toggleTheme] = useTheme();

	return (
		<header className="border-line relative flex h-14 flex-none items-center gap-2 border-b pr-3 pl-4">
			<Link
				to="/"
				aria-label={m.app_home()}
				className="hover:bg-surface -ml-1.5 flex h-9 items-center gap-2.5 rounded-sm px-1.5 transition-colors"
			>
				<LogoMark />
				<span className={`text-[17px] font-bold tracking-[-0.03em] ${editor ? 'max-md:hidden' : ''}`}>
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

			{editor && (
				<div className="mr-1.5 flex gap-0.5 max-md:hidden">
					<IconButton label={m.undo()} disabled={!actions?.canUndo} onClick={actions?.onUndo}>
						<Undo2 size={18} />
					</IconButton>
					<IconButton label={m.redo()} disabled={!actions?.canRedo} onClick={actions?.onRedo}>
						<Redo2 size={18} />
					</IconButton>
				</div>
			)}

			<IconButton label={theme === 'dark' ? m.theme_to_light() : m.theme_to_dark()} onClick={toggleTheme}>
				{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
			</IconButton>

			{editor && (
				<Button
					variant="primary"
					className="ml-1"
					disabled={!actions?.onExport}
					title={actions?.onExport ? undefined : m.export_later()}
					aria-pressed={actions?.exportActive}
					onClick={actions?.onExport}
				>
					{m.export()}
				</Button>
			)}

			{editor && <span className="bg-ed-line absolute inset-x-0 -bottom-px h-[3px]" aria-hidden="true" />}
		</header>
	);
}
