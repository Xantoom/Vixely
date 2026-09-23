import { createFileRoute } from '@tanstack/react-router';
import { EditorScreen } from '@/editor/EditorScreen';
import { validateEditorSearch } from '@/editors/search';

export const Route = createFileRoute('/gif')({
	validateSearch: validateEditorSearch,
	component: function GifEditor() {
		const { tool } = Route.useSearch();
		return <EditorScreen key={tool ?? 'info'} kind="gif" initialTool={tool} />;
	},
});
