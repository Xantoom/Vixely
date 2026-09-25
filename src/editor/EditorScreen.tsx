import { type ComponentType, lazy, Suspense, useEffect, useState } from 'react';
import type { MediaKind, ToolId } from '@/editors/registry';
import { useSession } from '@/media/session';
import { EditorLayout } from './EditorLayout';
import { FilePanel } from './Inspector';
import { EmptyViewer } from './Viewer';

type Screen = ComponentType<{ initialTool?: ToolId }>;

const LOADERS: Record<MediaKind, () => Promise<Screen>> = {
	video: async () => (await import('@/editors/video/VideoEditorScreen')).VideoEditorScreen,
	image: async () => (await import('@/editors/image/ImageEditorScreen')).ImageEditorScreen,
	gif: async () => (await import('@/editors/gif/GifEditorScreen')).GifEditorScreen,
	audio: async () => (await import('@/editors/audio/AudioEditorScreen')).AudioEditorScreen,
	subtitles: async () => (await import('@/editors/subtitles/SubtitleEditorScreen')).SubtitleEditorScreen,
};

const screen = (kind: MediaKind) => lazy(async () => ({ default: await LOADERS[kind]() }));

const SCREENS: Record<MediaKind, Screen> = {
	video: screen('video'),
	image: screen('image'),
	gif: screen('gif'),
	audio: screen('audio'),
	subtitles: screen('subtitles'),
};

/** Every editor before a file is open: somewhere to drop one, the tools, an empty file panel. */
function EmptyEditor({ kind, tool, onTool }: { kind: MediaKind; tool: ToolId; onTool: (tool: ToolId) => void }) {
	return (
		<EditorLayout
			kind={kind}
			tool={tool}
			onTool={onTool}
			viewer={<EmptyViewer kind={kind} />}
			inspector={<FilePanel opened={null} />}
		/>
	);
}

/**
 * An editor page. Until a file is open it shows the empty editor, which needs none of the
 * editor's own code (its media libraries weigh most of the app): the page shows at once, and the
 * editor loads meanwhile, ready by the time a file is chosen.
 */
export function EditorScreen({ kind, initialTool }: { kind: MediaKind; initialTool?: ToolId }) {
	const hasFile = useSession((state) => state.current?.kind === kind);
	const [shown, setShown] = useState(hasFile);
	const [tool, setTool] = useState<ToolId>(initialTool ?? 'info');
	if (hasFile && !shown) setShown(true);

	useEffect(() => {
		const load = () => void LOADERS[kind]();
		if ('requestIdleCallback' in window) {
			const id = requestIdleCallback(load, { timeout: 2000 });
			return () => {
				cancelIdleCallback(id);
			};
		}
		const id = setTimeout(load, 500);
		return () => {
			clearTimeout(id);
		};
	}, [kind]);

	const empty = <EmptyEditor kind={kind} tool={tool} onTool={setTool} />;
	if (!shown) return empty;
	const Screen = SCREENS[kind];
	return (
		<Suspense fallback={empty}>
			<Screen initialTool={tool} />
		</Suspense>
	);
}
