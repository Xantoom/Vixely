import { createFileRoute } from '@tanstack/react-router';
import { usePageHead } from '@/app/head';
import { EditorScreen } from '@/editor/EditorScreen';
import { validateEditorSearch } from '@/editors/search';
import { m } from '@/paraglide/messages.js';

export const Route = createFileRoute('/image')({
	validateSearch: validateEditorSearch,
	component: function ImageEditor() {
		const { tool } = Route.useSearch();
		usePageHead(m.editor_page_image(), m.editor_page_image_desc());
		return <EditorScreen key={tool ?? 'info'} kind="image" initialTool={tool} />;
	},
});
