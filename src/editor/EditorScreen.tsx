import { useNavigate } from '@tanstack/react-router';
import { AudioLines } from 'lucide-react';
import { useState } from 'react';
import { EDITORS, type MediaKind, type ToolId } from '@/editors/registry';
import { useSession } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/ui/Button';
import { EditorLayout } from './EditorLayout';
import { FilePanel, ToolLater } from './Inspector';
import { Timeline } from './Timeline';
import { Viewer } from './Viewer';

/** Opens the soundtrack of the current video in the audio editor. */
function AudioFromVideo() {
	const openAs = useSession((state) => state.openAs);
	const navigate = useNavigate();
	return (
		<section className="grid gap-2">
			<Button
				onClick={() => {
					openAs('audio');
					void navigate({ to: EDITORS.audio.path });
				}}
			>
				<AudioLines size={16} aria-hidden="true" />
				{m.audio_from_video()}
			</Button>
			<p className="text-small text-muted">{m.audio_from_video_hint()}</p>
		</section>
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
			viewer={<Viewer kind={kind} opened={opened} />}
			timeline={editor.timed && opened ? <Timeline info={opened.info} poster={opened.poster} /> : undefined}
			inspector={
				tool === 'info' ? (
					<>
						<FilePanel opened={opened} />
						{kind === 'video' && opened?.info?.audio && <AudioFromVideo />}
					</>
				) : (
					<ToolLater kind={kind} tool={tool} />
				)
			}
		/>
	);
}
