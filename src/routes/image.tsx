import { createFileRoute } from '@tanstack/react-router';
import { ImageEditorScreen } from '@/editors/image/ImageEditorScreen';
import { validateEditorSearch } from '@/editors/search';

export const Route = createFileRoute('/image')({
	validateSearch: validateEditorSearch,
	component: function ImageEditor() {
		const { tool } = Route.useSearch();
		return <ImageEditorScreen key={tool ?? 'info'} initialTool={tool} />;
	},
});
