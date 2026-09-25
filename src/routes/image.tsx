import { createFileRoute } from '@tanstack/react-router';
import { usePageHead } from '@/app/head';
import { ImageEditorScreen } from '@/editors/image/ImageEditorScreen';
import { validateEditorSearch } from '@/editors/search';
import { m } from '@/paraglide/messages.js';

export const Route = createFileRoute('/image')({
	validateSearch: validateEditorSearch,
	component: function ImageEditor() {
		const { tool } = Route.useSearch();
		usePageHead(m.editor_page_image(), m.editor_page_image_desc());
		return <ImageEditorScreen key={tool ?? 'info'} initialTool={tool} />;
	},
});
