import { createFileRoute } from '@tanstack/react-router';
import { usePageHead } from '@/app/head';
import { validateEditorSearch } from '@/editors/search';
import { VideoEditorScreen } from '@/editors/video/VideoEditorScreen';
import { m } from '@/paraglide/messages.js';

export const Route = createFileRoute('/video')({
	validateSearch: validateEditorSearch,
	component: function VideoEditor() {
		const { tool } = Route.useSearch();
		usePageHead(m.editor_page_video(), m.editor_page_video_desc());
		return <VideoEditorScreen key={tool ?? 'info'} initialTool={tool} />;
	},
});
