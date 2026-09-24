import { createFileRoute } from '@tanstack/react-router';
import { validateEditorSearch } from '@/editors/search';
import { SubtitleEditorScreen } from '@/editors/subtitles/SubtitleEditorScreen';

export const Route = createFileRoute('/subtitles')({
	validateSearch: validateEditorSearch,
	component: function SubtitlesEditor() {
		const { tool } = Route.useSearch();
		return <SubtitleEditorScreen key={tool ?? 'info'} initialTool={tool} />;
	},
});
