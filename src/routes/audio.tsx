import { createFileRoute } from '@tanstack/react-router';
import { AudioEditorScreen } from '@/editors/audio/AudioEditorScreen';
import { validateEditorSearch } from '@/editors/search';

export const Route = createFileRoute('/audio')({
	validateSearch: validateEditorSearch,
	component: function AudioEditor() {
		const { tool } = Route.useSearch();
		return <AudioEditorScreen key={tool ?? 'info'} initialTool={tool} />;
	},
});
