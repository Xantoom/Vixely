import { createFileRoute } from '@tanstack/react-router';
import { usePageHead } from '@/app/head';
import { EditorScreen } from '@/editor/EditorScreen';
import { validateEditorSearch } from '@/editors/search';
import { m } from '@/paraglide/messages.js';

export const Route = createFileRoute('/gif')({
	validateSearch: validateEditorSearch,
	component: function GifEditor() {
		const { tool } = Route.useSearch();
		usePageHead(m.editor_page_gif(), m.editor_page_gif_desc());
		return <EditorScreen key={tool ?? 'info'} kind="gif" initialTool={tool} />;
	},
});
