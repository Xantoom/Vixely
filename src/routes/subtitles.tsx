import { createFileRoute } from '@tanstack/react-router';
import { usePageHead } from '@/app/head';
import { EditorScreen } from '@/editor/EditorScreen';
import { validateEditorSearch } from '@/editors/search';
import { m } from '@/paraglide/messages.js';

export const Route = createFileRoute('/subtitles')({
	validateSearch: validateEditorSearch,
	component: function SubtitlesEditor() {
		const { tool } = Route.useSearch();
		usePageHead(m.editor_page_subtitles(), m.editor_page_subtitles_desc());
		return <EditorScreen key={tool ?? 'info'} kind="subtitles" initialTool={tool} />;
	},
});
