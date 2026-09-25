import { createFileRoute } from '@tanstack/react-router';
import { usePageHead } from '@/app/head';
import { EditorScreen } from '@/editor/EditorScreen';
import { validateEditorSearch } from '@/editors/search';
import { m } from '@/paraglide/messages.js';

export const Route = createFileRoute('/video')({
	validateSearch: validateEditorSearch,
	component: function VideoEditor() {
		const { tool } = Route.useSearch();
		usePageHead(m.editor_page_video(), m.editor_page_video_desc());
		return <EditorScreen key={tool ?? 'info'} kind="video" initialTool={tool} />;
	},
});
