import { useState } from 'react';
import { EDITORS, type MediaKind, type ToolId } from '@/editors/registry';
import { useSession } from '@/media/session';
import { EditorLayout } from './EditorLayout';
import { FilePanel, ToolLater } from './Inspector';
import { Timeline } from './Timeline';
import { Viewer } from './Viewer';

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
			inspector={tool === 'info' ? <FilePanel opened={opened} /> : <ToolLater kind={kind} tool={tool} />}
		/>
	);
}
