import { createFileRoute } from '@tanstack/react-router';
import { GifEditorScreen } from '@/editors/gif/GifEditorScreen';
import { validateEditorSearch } from '@/editors/search';

export const Route = createFileRoute('/gif')({
	validateSearch: validateEditorSearch,
	component: function GifEditor() {
		const { tool } = Route.useSearch();
		return <GifEditorScreen key={tool ?? 'info'} initialTool={tool} />;
	},
});
