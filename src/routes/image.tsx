import { createFileRoute } from '@tanstack/react-router';
import { EditorScreen } from '@/editor/EditorScreen';
import { validateEditorSearch } from '@/editors/search';

export const Route = createFileRoute('/image')({
	validateSearch: validateEditorSearch,
	component: function ImageEditor() {
		const { tool } = Route.useSearch();
		return <EditorScreen key={tool ?? 'info'} kind="image" initialTool={tool} />;
	},
});
