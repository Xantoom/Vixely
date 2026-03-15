import { ChevronDown } from 'lucide-react';
import { useState, useCallback } from 'react';

interface FAQItemProps {
	question: string;
	answer: string;
}

/**
 * Animated accordion FAQ item.
 * Uses `grid-template-rows: 0fr → 1fr` for smooth height transitions (GPU-accelerated, no JS measuring).
 * Chevron rotates 180° on open with matching easing.
 */
export function FAQItem({ question, answer }: FAQItemProps) {
	const [open, setOpen] = useState(false);
	const toggle = useCallback(() => {
		setOpen((prev) => !prev);
	}, []);

	return (
		<div
			className={`rounded-xl border bg-surface/40 transition-colors duration-200 ${
				open ? 'border-accent/20 bg-surface/50' : 'border-border'
			}`}
		>
			<button
				onClick={toggle}
				className="w-full flex items-center justify-between gap-4 p-5 text-left cursor-pointer transition-colors duration-150 hover:bg-surface/60"
				aria-expanded={open}
			>
				<span className="text-[14px] font-medium text-text">{question}</span>
				<ChevronDown
					size={16}
					className={`shrink-0 text-text-tertiary transition-transform duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] ${
						open ? 'rotate-180' : ''
					}`}
				/>
			</button>

			{/* Animated content area via grid-rows trick */}
			<div
				className={`grid transition-[grid-template-rows] duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] ${
					open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
				}`}
			>
				<div className="overflow-hidden">
					<div className="px-5 pb-5">
						<p className="text-[13px] text-text-secondary leading-relaxed">{answer}</p>
					</div>
				</div>
			</div>
		</div>
	);
}
