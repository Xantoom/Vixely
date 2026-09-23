import { createFileRoute } from '@tanstack/react-router';
import { EditorScreen } from '@/editor/EditorScreen';
import { validateEditorSearch } from '@/editors/search';

export const Route = createFileRoute('/subtitles')({
	validateSearch: validateEditorSearch,
	component: function SubtitlesEditor() {
		const { tool } = Route.useSearch();
		return <EditorScreen key={tool ?? 'info'} kind="subtitles" initialTool={tool} />;
	},
});
