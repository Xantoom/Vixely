import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button.tsx';

type EmptyStateVariant = 'default' | 'hero';

interface EditorEmptyStateProps {
	icon: LucideIcon;
	isDragging: boolean;
	title: string;
	description: string;
	dragTitle?: string;
	dragDescription?: string;
	chooseLabel?: string;
	onChooseFile?: () => void;
	variant?: EmptyStateVariant;
}

export function EditorEmptyState({
	icon: Icon,
	isDragging,
	title,
	description,
	dragTitle = 'Drop your file here',
	dragDescription = 'Release to load',
	chooseLabel = 'Choose File',
	onChooseFile,
	variant = 'default',
}: EditorEmptyStateProps) {
	const iconContainerClass =
		variant === 'hero'
			? 'rounded-3xl px-14 py-12 mb-6 border border-border bg-surface'
			: 'rounded-2xl p-8 mb-5 border border-border bg-surface';
	const iconSize = variant === 'hero' ? 72 : 48;
	const titleClass =
		variant === 'hero' ? 'text-lg font-semibold text-text-secondary' : 'text-sm font-medium text-text-secondary';
	const descriptionClass =
		variant === 'hero' ? 'mt-2 text-sm text-text-tertiary' : 'mt-1 text-[14px] text-text-tertiary';

	return (
		<div className="flex flex-col items-center text-center max-w-lg px-4">
			<div
				className={`${iconContainerClass} transition-all ${
					isDragging ? 'border-accent scale-105 shadow-[0_0_40px_var(--color-accent-glow)]' : ''
				}`}
			>
				<Icon
					size={iconSize}
					strokeWidth={1.2}
					className={`transition-colors ${isDragging ? 'text-accent' : 'text-accent/25'}`}
				/>
			</div>
			<p className={titleClass}>{isDragging ? dragTitle : title}</p>
			<p className={descriptionClass}>{isDragging ? dragDescription : description}</p>
			{!isDragging && onChooseFile && (
				<Button
					variant="secondary"
					size={variant === 'hero' ? 'md' : 'sm'}
					className={variant === 'hero' ? 'mt-5 h-10 px-5 text-sm' : 'mt-4'}
					onClick={onChooseFile}
				>
					{chooseLabel}
				</Button>
			)}
		</div>
	);
}
