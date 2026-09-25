import { createFileRoute } from '@tanstack/react-router';
import { validateEditorSearch } from '@/editors/search';
import { VideoEditorScreen } from '@/editors/video/VideoEditorScreen';

export const Route = createFileRoute('/video')({
	validateSearch: validateEditorSearch,
	component: function VideoEditor() {
		const { tool } = Route.useSearch();
		return <VideoEditorScreen key={tool ?? 'info'} initialTool={tool} />;
	},
});
