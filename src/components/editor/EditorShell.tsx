import type { ReactNode } from 'react';

type EditorKind = 'video' | 'image' | 'gif';

interface EditorShellProps {
	editor: EditorKind;
	main: ReactNode;
	inspector?: ReactNode;
	mobileToggle?: ReactNode;
	mobileDrawer?: ReactNode;
	overlays?: ReactNode;
}

export function EditorShell({ editor, main, inspector, mobileToggle, mobileDrawer, overlays }: EditorShellProps) {
	return (
		<div data-editor={editor} className="h-full flex flex-col">
			<div className="h-0.5 gradient-accent shrink-0" />
			<div className="flex flex-1 min-h-0 animate-fade-in">
				<div className="flex-1 flex flex-col min-w-0">{main}</div>
				{mobileToggle}
				{inspector}
				{mobileDrawer}
			</div>
			{overlays}
		</div>
	);
}
