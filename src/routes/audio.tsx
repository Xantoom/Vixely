import { createFileRoute } from '@tanstack/react-router';
import { usePageHead } from '@/app/head';
import { EditorScreen } from '@/editor/EditorScreen';
import { validateEditorSearch } from '@/editors/search';
import { m } from '@/paraglide/messages.js';

export const Route = createFileRoute('/audio')({
	validateSearch: validateEditorSearch,
	component: function AudioEditor() {
		const { tool } = Route.useSearch();
		usePageHead(m.editor_page_audio(), m.editor_page_audio_desc());
		return <EditorScreen key={tool ?? 'info'} kind="audio" initialTool={tool} />;
	},
});
