import { createFileRoute } from '@tanstack/react-router';
import { EditorScreen } from '@/editor/EditorScreen';
import { validateEditorSearch } from '@/editors/search';

export const Route = createFileRoute('/audio')({
	validateSearch: validateEditorSearch,
	component: function AudioEditor() {
		const { tool } = Route.useSearch();
		return <EditorScreen key={tool ?? 'info'} kind="audio" initialTool={tool} />;
	},
});
