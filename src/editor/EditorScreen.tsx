import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { EDITORS, type MediaKind, type ToolId } from '@/editors/registry';
import { VideoPreview } from '@/editors/video/VideoPreview';
import { useSession } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/ui/Button';
import { MEDIA_ICONS } from '@/ui/icons';
import { EditorLayout } from './EditorLayout';
import { FilePanel, ToolLater } from './Inspector';
import { Timeline } from './Timeline';
import { Viewer } from './Viewer';

const OPEN_IN = {
	audio: () => m.audio_from_video(),
	gif: () => m.make_gif(),
	subtitles: () => m.subtitles_from_video(),
};

/**
 * Opens the current video in another editor: its soundtrack in the audio one, a GIF in the GIF
 * one, its subtitle tracks in the subtitle one.
 */
function OpenIn({ kind }: { kind: 'audio' | 'gif' | 'subtitles' }) {
	const openAs = useSession((state) => state.openAs);
	const navigate = useNavigate();
	const Icon = MEDIA_ICONS[kind];
	return (
		<Button
			onClick={() => {
				openAs(kind);
				void navigate({ to: EDITORS[kind].path });
			}}
		>
			<Icon size={16} aria-hidden="true" />
			{OPEN_IN[kind]()}
		</Button>
	);
}

/** Screen for editors whose tools are not built yet: opens files and shows what they contain. */
export function EditorScreen({ kind, initialTool }: { kind: MediaKind; initialTool?: ToolId }) {
	const editor = EDITORS[kind];
	const current = useSession((state) => state.current);
	const opened = current?.kind === kind ? current : null;
	const [tool, setTool] = useState<ToolId>(initialTool && editor.tools.includes(initialTool) ? initialTool : 'info');

	return (
		<EditorLayout
			kind={kind}
			fileName={opened?.file.name}
			tool={tool}
			onTool={setTool}
			viewer={
				kind === 'video' && opened?.info?.video?.decodable ? (
					<VideoPreview opened={opened} />
				) : (
					<Viewer kind={kind} opened={opened} />
				)
			}
			timeline={editor.timed && opened ? <Timeline info={opened.info} poster={opened.poster} /> : undefined}
			inspector={
				tool === 'info' ? (
					<>
						<FilePanel opened={opened} />
						{kind === 'video' && opened && (
							<div className="grid gap-2">
								{opened.info?.video?.decodable && <OpenIn kind="gif" />}
								{opened.info?.audio && <OpenIn kind="audio" />}
								<OpenIn kind="subtitles" />
							</div>
						)}
					</>
				) : (
					<ToolLater kind={kind} tool={tool} />
				)
			}
		/>
	);
}
