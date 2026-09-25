import { createFileRoute } from '@tanstack/react-router';
import { usePageHead } from '@/app/head';
import { GifEditorScreen } from '@/editors/gif/GifEditorScreen';
import { validateEditorSearch } from '@/editors/search';
import { m } from '@/paraglide/messages.js';

export const Route = createFileRoute('/gif')({
	validateSearch: validateEditorSearch,
	component: function GifEditor() {
		const { tool } = Route.useSearch();
		usePageHead(m.editor_page_gif(), m.editor_page_gif_desc());
		return <GifEditorScreen key={tool ?? 'info'} initialTool={tool} />;
	},
});
