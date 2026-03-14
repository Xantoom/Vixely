export const EDITOR_UX_STORAGE_KEY = 'vixely:ux:mode';

export const DEFAULT_EDITOR_UX_MODE = 'simple' as const;

export const EDITOR_UX_MODE_COPY = {
	label: 'Editing mode',
	simple: { label: 'Simple', description: 'Essential controls for fast editing.' },
	expert: { label: 'Expert', description: 'Advanced controls for full precision.' },
} as const;
