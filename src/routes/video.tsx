import { createFileRoute } from '@tanstack/react-router';
import { EditorScreen } from '@/editor/EditorScreen';
import { validateEditorSearch } from '@/editors/search';

export const Route = createFileRoute('/video')({
	validateSearch: validateEditorSearch,
	component: function VideoEditor() {
		const { tool } = Route.useSearch();
		return <EditorScreen key={tool ?? 'info'} kind="video" initialTool={tool} />;
	},
});
