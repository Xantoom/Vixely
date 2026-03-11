import { EDITOR_UX_MODE_COPY } from '@/config/editorUx.ts';
import type { EditorUxMode } from '@/stores/editorUx.ts';

interface EditorUxModeSwitchProps {
	mode: EditorUxMode;
	onChange: (mode: EditorUxMode) => void;
}

export function EditorUxModeSwitch({ mode, onChange }: EditorUxModeSwitchProps) {
	return (
		<div
			role="group"
			aria-label={EDITOR_UX_MODE_COPY.label}
			className="inline-flex items-center gap-0.5 rounded-md border border-border/60 bg-bg/40 p-0.5"
		>
			<button
				type="button"
				onClick={() => {
					onChange('simple');
				}}
				className={`rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors cursor-pointer ${
					mode === 'simple'
						? 'bg-accent/15 text-accent'
						: 'text-text-tertiary hover:text-text-secondary hover:bg-surface-raised/40'
				}`}
				title={EDITOR_UX_MODE_COPY.simple.description}
				aria-pressed={mode === 'simple'}
				aria-label={EDITOR_UX_MODE_COPY.simple.label}
			>
				{EDITOR_UX_MODE_COPY.simple.label}
			</button>
			<button
				type="button"
				onClick={() => {
					onChange('expert');
				}}
				className={`rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors cursor-pointer ${
					mode === 'expert'
						? 'bg-accent/15 text-accent'
						: 'text-text-tertiary hover:text-text-secondary hover:bg-surface-raised/40'
				}`}
				title={EDITOR_UX_MODE_COPY.expert.description}
				aria-pressed={mode === 'expert'}
				aria-label={EDITOR_UX_MODE_COPY.expert.label}
			>
				{EDITOR_UX_MODE_COPY.expert.label}
			</button>
		</div>
	);
}
