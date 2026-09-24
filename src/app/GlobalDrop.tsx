import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { EDITOR_ORDER, EDITORS, type MediaKind } from '@/editors/registry';
import { useSession } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { filesFromDrop } from './files';

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
	const depth = useRef(0);
	const open = useSession((state) => state.open);
	const navigate = useNavigate();
	const path = useRouterState({ select: (state) => state.location.pathname });
	const editor: MediaKind | undefined = EDITOR_ORDER.find((kind) => EDITORS[kind].path === path);

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
				if (kind) await navigate({ to: EDITORS[kind].path });
			});
		};
		window.addEventListener('dragenter', onDragEnter);
		window.addEventListener('dragleave', onDragLeave);
		window.addEventListener('dragover', onDragOver);
		window.addEventListener('drop', onDrop);
		return () => {
			window.removeEventListener('dragenter', onDragEnter);
			window.removeEventListener('dragleave', onDragLeave);
			window.removeEventListener('dragover', onDragOver);
			window.removeEventListener('drop', onDrop);
		};
	}, [open, navigate, editor]);

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
