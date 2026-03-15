import type { ReactNode } from 'react';

interface EditorQuickActionsProps {
	heading?: ReactNode;
	status?: ReactNode;
	error?: string | null;
	primaryAction: ReactNode;
	secondaryAction?: ReactNode;
}

export function EditorQuickActions({
	heading,
	status,
	error,
	primaryAction,
	secondaryAction,
}: EditorQuickActionsProps) {
	return (
		<div className="p-3 border-t border-border flex flex-col gap-2 bg-surface-raised/10 min-w-0">
			{heading}
			{status}
			{error && (
				<div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
					{error}
				</div>
			)}
			{primaryAction}
			{secondaryAction}
		</div>
	);
}
