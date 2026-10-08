import { useNavigate } from '@tanstack/react-router';
import { ChevronDown, File as FileIcon, FolderOpen, TriangleAlert, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { EDITORS, type MediaKind } from '@/editors/registry';
import { formatBytes } from '@/lib/format';
import { usePlayback } from '@/media/playback';
import { useSession } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { Alert } from '@/ui/Alert';
import { Button } from '@/ui/Button';
import { Menu } from '@/ui/Menu';

type FileAction = 'open' | 'close';

/**
 * The open file's name in the bar, as a menu: open another file in its place, or close it. Edits
 * not exported yet are asked about first.
 */
export function FileMenu({
	editor,
	fileName,
	unsaved,
}: {
	editor: MediaKind;
	/** Absent for a batch, which has no one name. */
	fileName?: string;
	/** Edits that would be lost. */
	unsaved: boolean;
}) {
	const opened = useSession((state) => state.opened[editor]);
	const open = useSession((state) => state.open);
	const close = useSession((state) => state.close);
	const navigate = useNavigate();
	const picker = useRef<HTMLInputElement>(null);
	const [asking, setAsking] = useState<FileAction | null>(null);

	const run = (action: FileAction) => {
		setAsking(null);
		if (action === 'open') {
			picker.current?.click();
			return;
		}
		const file = useSession.getState().opened[editor]?.file;
		// Nothing of it is heard any more.
		if (file && usePlayback.getState().file === file) usePlayback.getState().load(null);
		close(editor);
	};

	return (
		<>
			<Menu<FileAction>
				label={m.file_menu()}
				value={null}
				align="start"
				header={
					fileName && (
						<div className="grid max-w-80 gap-0.5">
							{/* The whole name, which the bar cuts short: long names wrap anywhere. */}
							<span className="text-ui text-ink font-medium [overflow-wrap:anywhere]">{fileName}</span>
							{opened && (
								<span className="text-small text-muted tabular">
									{opened.format.toUpperCase()}, {formatBytes(opened.file.size)}
								</span>
							)}
						</div>
					)
				}
				items={[
					{ value: 'open', label: m.file_open_other(), leading: <FolderOpen className="size-4" /> },
					{ value: 'close', label: m.file_close(), leading: <X className="size-4" /> },
				]}
				onChange={(action) => {
					if (unsaved) setAsking(action);
					else run(action);
				}}
				className="min-w-0"
				buttonClassName="text-ui flex! h-9! min-w-0! max-w-full items-center gap-1.5 px-2 font-medium"
			>
				<FileIcon className="size-4 flex-none md:hidden" aria-hidden="true" />
				<span className="relative top-px min-w-0 truncate max-md:sr-only">{fileName ?? m.file_menu()}</span>
				<ChevronDown className="text-muted size-4 flex-none" aria-hidden="true" />
			</Menu>
			<input
				ref={picker}
				type="file"
				multiple
				hidden
				onChange={(event) => {
					const files = [...(event.target.files ?? [])];
					event.target.value = '';
					if (files.length === 0) return;
					void open(files, editor).then(async (kind) => {
						if (kind && kind !== editor) await navigate({ to: EDITORS[kind].path });
					});
				}}
			/>
			{asking && (
				<Alert
					media={editor}
					title={asking === 'close' ? m.file_close_title() : m.file_open_title()}
					icon={<TriangleAlert className="text-ed-text size-5" aria-hidden="true" />}
					onClose={() => {
						setAsking(null);
					}}
					actions={
						<>
							<Button
								onClick={() => {
									setAsking(null);
								}}
							>
								{m.cancel()}
							</Button>
							<Button
								variant="primary"
								onClick={() => {
									run(asking);
								}}
							>
								{asking === 'close' ? m.file_close() : m.file_open_other()}
							</Button>
						</>
					}
				>
					{m.file_unsaved()}
				</Alert>
			)}
		</>
	);
}
