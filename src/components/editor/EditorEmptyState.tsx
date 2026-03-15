import { Upload } from 'lucide-react';
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
	/** Short format hints shown below the button, e.g. ["MP4", "WebM", "MKV"] */
	formatHints?: readonly string[];
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
	formatHints,
}: EditorEmptyStateProps) {
	const isHero = variant === 'hero';

	return (
		<div className={`w-full ${isHero ? 'max-w-xl' : 'max-w-md'} px-2 sm:px-4`}>
			<div
				className={`relative overflow-hidden rounded-2xl border-2 border-dashed p-8 sm:p-10 text-center transition-all duration-200 ${
					isDragging
						? 'border-accent/60 bg-accent/[0.04] shadow-[0_0_0_4px_var(--color-accent-surface)]'
						: 'border-border/60 bg-surface/30 hover:border-accent/25 hover:bg-surface/40'
				}`}
			>
				{/* Icon area */}
				<div className="flex flex-col items-center">
					<div
						className={`flex items-center justify-center rounded-2xl transition-all duration-200 ${
							isHero ? 'h-16 w-16 mb-5' : 'h-12 w-12 mb-4'
						} ${isDragging ? 'bg-accent/12 text-accent scale-110' : 'bg-accent/8 text-accent/70'}`}
					>
						{isDragging ? (
							<Upload size={isHero ? 28 : 22} strokeWidth={1.5} className="animate-slide-up" />
						) : (
							<Icon size={isHero ? 28 : 22} strokeWidth={1.5} />
						)}
					</div>

					{/* Title */}
					<h2
						className={`font-semibold tracking-tight transition-colors duration-200 ${
							isHero ? 'text-lg sm:text-xl' : 'text-base'
						} ${isDragging ? 'text-accent' : 'text-text'}`}
					>
						{isDragging ? dragTitle : title}
					</h2>

					{/* Description */}
					<p
						className={`mt-1.5 text-text-secondary ${
							isHero ? 'text-[14px] sm:text-[15px]' : 'text-[13px]'
						}`}
					>
						{isDragging ? dragDescription : description}
					</p>

					{/* Button */}
					{!isDragging && onChooseFile && (
						<div className="mt-5">
							<Button variant="primary" size={isHero ? 'md' : 'sm'} onClick={onChooseFile}>
								{chooseLabel}
							</Button>
						</div>
					)}

					{/* Format hints */}
					{!isDragging && formatHints && formatHints.length > 0 && (
						<p className="mt-3 text-[12px] text-text-tertiary">{formatHints.join(' · ')}</p>
					)}
				</div>
			</div>
		</div>
	);
}
