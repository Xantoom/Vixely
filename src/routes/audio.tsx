import { createFileRoute } from '@tanstack/react-router';
import { usePageHead } from '@/app/head';
import { AudioEditorScreen } from '@/editors/audio/AudioEditorScreen';
import { validateEditorSearch } from '@/editors/search';
import { m } from '@/paraglide/messages.js';

export const Route = createFileRoute('/audio')({
	validateSearch: validateEditorSearch,
	component: function AudioEditor() {
		const { tool } = Route.useSearch();
		usePageHead(m.editor_page_audio(), m.editor_page_audio_desc());
		return <AudioEditorScreen key={tool ?? 'info'} initialTool={tool} />;
	},
});
