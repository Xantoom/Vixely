import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { isTyping } from '@/editor/shortcuts';
import { EDITOR_ORDER, EDITORS, type MediaKind } from '@/editors/registry';
import { useSession } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { fetchMessage } from './DropZone';
import { fetchFile, fileAddress } from './fetch-file';
import { filesFromDrop } from './files';
import { takeSharedFiles } from './pwa';
import { taskBySlug } from './tasks';

/**
 * Lets an editor take dropped files its own way, such as a video dropped on subtitles becoming
 * their preview. Returns true when it took them.
 */
type DropHandler = (files: File[]) => Promise<boolean>;

let handler: DropHandler | null = null;

export function useDropHandler(next: DropHandler) {
	const ref = useRef(next);
	ref.current = next;
	useEffect(() => {
		const own: DropHandler = async (files) => ref.current(files);
		handler = own;
		return () => {
			if (handler === own) handler = null;
		};
	}, []);
}

interface LaunchParams {
	files: readonly FileSystemFileHandle[];
}

declare global {
	interface Window {
		/** Files the installed app is opened with, from the file explorer ("Open with Vixely"). */
		launchQueue?: { setConsumer: (consumer: (params: LaunchParams) => void) => void };
	}
}

function hasFiles(event: DragEvent): boolean {
	return event.dataTransfer?.types.includes('Files') ?? false;
}

/**
 * Files dropped anywhere in the window open, from the file explorer or the desktop: in the
 * editor on screen when they fit it, else in the editor made for them. The whole window shows
 * it takes them while they are dragged over.
 */
export function GlobalDrop() {
	const [over, setOver] = useState(false);
	const [pasteError, setPasteError] = useState<string | null>(null);
	const depth = useRef(0);
	const open = useSession((state) => state.open);
	const navigate = useNavigate();
	const path = useRouterState({ select: (state) => state.location.pathname });
	const editor: MediaKind | undefined =
		EDITOR_ORDER.find((kind) => EDITORS[kind].path === path) ??
		(path.startsWith('/tools/') ? taskBySlug(path.slice('/tools/'.length))?.editor : undefined);

	// Files the installed app is opened with, or shared with it from another app.
	const launched = useRef(false);
	useEffect(() => {
		if (launched.current) return;
		launched.current = true;
		const openLaunched = async (files: File[]) => {
			if (files.length === 0) return;
			const kind = await open(files);
			if (kind) await navigate({ to: EDITORS[kind].path });
		};
		window.launchQueue?.setConsumer((params) => {
			void Promise.all(params.files.map(async (handle) => handle.getFile())).then(openLaunched);
		});
		if (new URLSearchParams(location.search).has('shared')) {
			history.replaceState(null, '', location.pathname);
			void takeSharedFiles().then(openLaunched);
		}
	}, [open, navigate]);

	useEffect(() => {
		const onDragEnter = (event: DragEvent) => {
			if (!hasFiles(event)) return;
			depth.current += 1;
			setOver(true);
		};
		const onDragLeave = (event: DragEvent) => {
			if (!hasFiles(event)) return;
			depth.current = Math.max(0, depth.current - 1);
			if (depth.current === 0) setOver(false);
		};
		const onDragOver = (event: DragEvent) => {
			if (!hasFiles(event) || !event.dataTransfer) return;
			// Without this the browser would open the file in the tab, leaving the app.
			event.preventDefault();
			event.dataTransfer.dropEffect = 'copy';
		};
		const onDrop = (event: DragEvent) => {
			depth.current = 0;
			setOver(false);
			if (!hasFiles(event) || !event.dataTransfer) return;
			event.preventDefault();
			void filesFromDrop(event.dataTransfer).then(async (files) => {
				if (files.length === 0) return;
				if (handler && (await handler(files))) return;
				const kind = await open(files, editor);
				if (kind && kind !== editor) await navigate({ to: EDITORS[kind].path });
			});
		};
		window.addEventListener('dragenter', onDragEnter);
		window.addEventListener('dragleave', onDragLeave);
		window.addEventListener('dragover', onDragOver);
		// Pasted files (a copied picture) open like dropped ones; a pasted address is downloaded.
		const onPaste = (event: ClipboardEvent) => {
			if (isTyping(event.target) || !event.clipboardData) return;
			const files = [...event.clipboardData.files];
			const text = event.clipboardData.getData('text/plain');
			if (files.length === 0 && !fileAddress(text)) return;
			event.preventDefault();
			void (async () => {
				const pasted = files.length > 0 ? files : [await fetchFile(text)];
				if (handler && (await handler(pasted))) return;
				const kind = await open(pasted, editor);
				if (kind && kind !== editor) await navigate({ to: EDITORS[kind].path });
			})().catch((failure: unknown) => {
				useSession.setState({ error: null });
				setPasteError(fetchMessage(failure));
			});
		};
		window.addEventListener('drop', onDrop);
		window.addEventListener('paste', onPaste);
		return () => {
			window.removeEventListener('paste', onPaste);
			window.removeEventListener('dragenter', onDragEnter);
			window.removeEventListener('dragleave', onDragLeave);
			window.removeEventListener('dragover', onDragOver);
			window.removeEventListener('drop', onDrop);
		};
	}, [open, navigate, editor]);

	if (pasteError && !over) {
		return (
			<div
				role="alert"
				className="bg-ink text-bg text-ui fixed bottom-6 left-1/2 z-50 flex max-w-[min(36rem,calc(100%-2rem))] -translate-x-1/2 items-center gap-3 rounded-md px-4 py-3 shadow-lg"
			>
				<span className="flex-1">{pasteError}</span>
				<button
					type="button"
					className="font-semibold underline underline-offset-[3px]"
					onClick={() => {
						setPasteError(null);
					}}
				>
					{m.dismiss()}
				</button>
			</div>
		);
	}
	if (!over) return null;
	return (
		<div
			data-media={editor}
			className="pointer-events-none fixed inset-2 z-50 grid place-items-center rounded-md border-2 border-dashed border-[var(--ed)] bg-[color-mix(in_srgb,var(--bg)_70%,transparent)]"
		>
			<span className="bg-ed text-ed-ink rounded-sm px-4 py-2 text-lg font-semibold">{m.drop_anywhere()}</span>
		</div>
	);
}
