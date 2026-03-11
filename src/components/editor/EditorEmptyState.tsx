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
	const isHero = variant === 'hero';
	const activeTitle = isDragging ? dragTitle : title;
	const activeDescription = isDragging ? dragDescription : description;

	return (
		<div className={`w-full ${isHero ? 'max-w-2xl' : 'max-w-xl'} px-1 sm:px-2`}>
			<div
				className={`relative overflow-hidden rounded-[28px] border p-7 text-center transition-all duration-300 sm:p-8 ${
					isDragging
						? 'border-accent/40 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-accent)_8%,rgba(24,24,27,0.9))_0%,rgba(9,9,11,0.98)_100%)] shadow-[0_0_0_1px_var(--color-accent-surface),0_24px_60px_rgba(0,0,0,0.36)]'
						: 'border-[color:color-mix(in_oklab,var(--color-accent)_12%,var(--color-border))] bg-[linear-gradient(180deg,rgba(24,24,27,0.78)_0%,rgba(10,10,13,0.96)_100%)] shadow-[0_20px_48px_rgba(0,0,0,0.28)]'
				}`}
			>
				<div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.012)_0%,transparent_26%)]" />
				<div className="relative">
					<div
						className={`mx-auto flex items-center justify-center rounded-[22px] border transition-all duration-300 ${
							isHero ? 'h-16 w-16' : 'h-14 w-14'
						} ${
							isDragging
								? 'border-accent/30 bg-accent/14 text-accent'
								: 'border-accent/18 bg-accent/10 text-accent'
						}`}
					>
						<Icon size={isHero ? 28 : 24} strokeWidth={1.5} />
					</div>

					<h2
						className={`mt-6 text-balance font-semibold tracking-tight text-text ${
							isHero ? 'text-[1.75rem] leading-[1.08] sm:text-[2rem]' : 'text-xl'
						}`}
					>
						{activeTitle}
					</h2>
					<p
						className={`mx-auto max-w-lg text-pretty text-text-secondary ${
							isHero ? 'mt-3 text-[15px] leading-6 sm:text-base' : 'mt-2 text-sm leading-6'
						}`}
					>
						{activeDescription}
					</p>

					{!isDragging && onChooseFile && (
						<div className="mt-6 flex justify-center">
							<Button
								variant="primary"
								size={isHero ? 'md' : 'sm'}
								className="shadow-[0_12px_30px_var(--color-accent-glow)]"
								onClick={onChooseFile}
							>
								{chooseLabel}
							</Button>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
