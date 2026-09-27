import { type ComponentType, lazy, Suspense, useEffect, useState } from 'react';
import { EDITOR_ORDER, type MediaKind, type ToolId } from '@/editors/registry';
import { useSession } from '@/media/session';
import { EditorLayout } from './EditorLayout';
import { EmptyViewer } from './Viewer';

type Screen = ComponentType<{ initialTool?: ToolId }>;

const LOADERS: Record<MediaKind, () => Promise<Screen>> = {
	video: async () => (await import('@/editors/video/VideoEditorScreen')).VideoEditorScreen,
	image: async () => (await import('@/editors/image/ImageEditorScreen')).ImageEditorScreen,
	gif: async () => (await import('@/editors/gif/GifEditorScreen')).GifEditorScreen,
	audio: async () => (await import('@/editors/audio/AudioEditorScreen')).AudioEditorScreen,
	subtitles: async () => (await import('@/editors/subtitles/SubtitleEditorScreen')).SubtitleEditorScreen,
};

/** Editors already loaded: they show at once, without a moment of the empty editor. */
const loaded = new Map<MediaKind, Screen>();

async function loadScreen(kind: MediaKind): Promise<Screen> {
	const Screen = await LOADERS[kind]();
	loaded.set(kind, Screen);
	return Screen;
}

const screen = (kind: MediaKind) => lazy(async () => ({ default: await loadScreen(kind) }));

const SCREENS: Record<MediaKind, Screen> = {
	video: screen('video'),
	image: screen('image'),
	gif: screen('gif'),
	audio: screen('audio'),
	subtitles: screen('subtitles'),
};

/** Every editor before a file is open: somewhere to drop one, and its tools, waiting for it. */
function EmptyEditor({ kind, tool, onTool }: { kind: MediaKind; tool: ToolId; onTool: (tool: ToolId) => void }) {
	return (
		<EditorLayout kind={kind} tool={tool} onTool={onTool} viewer={<EmptyViewer kind={kind} />} inspector={null} />
	);
}

/**
 * An editor page. Until a file is open it shows the empty editor, which needs none of the
 * editor's own code (its media libraries weigh most of the app): the page shows at once, and the
 * editor loads meanwhile, ready by the time a file is chosen.
 */
export function EditorScreen({ kind, initialTool }: { kind: MediaKind; initialTool?: ToolId }) {
	const hasFile = useSession((state) => Boolean(state.opened[kind]));
	const [shown, setShown] = useState(hasFile);
	const [tool, setTool] = useState<ToolId>(initialTool ?? 'info');
	if (hasFile && !shown) setShown(true);

	// The editor on screen is the one a closed tab comes back to.
	useEffect(() => {
		if (hasFile) useSession.getState().focus(kind);
	}, [hasFile, kind]);

	useEffect(() => {
		// This editor first, then the others, so going from one to another is instant too.
		const load = () =>
			void loadScreen(kind).then(async () =>
				Promise.all(EDITOR_ORDER.filter((other) => other !== kind).map(loadScreen)),
			);
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
	const Screen = loaded.get(kind) ?? SCREENS[kind];
	return (
		<Suspense fallback={empty}>
			<Screen initialTool={tool} />
		</Suspense>
	);
}
