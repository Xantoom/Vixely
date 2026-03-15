import { Link } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';
import type { DragEventHandler } from 'react';
import type { ReactNode } from 'react';
import { FAQItem } from '@/components/ui/FAQItem.tsx';

/* ── Types ── */

interface Feature {
	icon: LucideIcon;
	title: string;
	description: string;
}

interface CrossLink {
	title: string;
	subtitle: string;
	href: '/tools/video' | '/tools/image' | '/tools/gif';
	icon: LucideIcon;
	accentBg: string;
	accentText: string;
	borderTop: string;
}

interface FAQ {
	question: string;
	answer: string;
}

interface EditorLandingProps {
	emptyState: ReactNode;
	dropHandlers: {
		onDragEnter: DragEventHandler<HTMLDivElement>;
		onDragLeave: DragEventHandler<HTMLDivElement>;
		onDragOver: DragEventHandler<HTMLDivElement>;
		onDrop: DragEventHandler<HTMLDivElement>;
	};
	isDragging: boolean;
	hasFile: boolean;
	replaceLabel: string;
	features: Feature[];
	formats: readonly string[];
	formatColor: string;
	faqs: FAQ[];
	crossLinks: CrossLink[];
}

/* ── Main Component ── */

export function EditorLanding({
	emptyState,
	dropHandlers,
	isDragging,
	hasFile,
	replaceLabel,
	features,
	formats,
	formatColor,
	faqs,
	crossLinks,
}: EditorLandingProps) {
	if (hasFile) {
		return null;
	}

	return (
		<div className="h-full overflow-y-auto workspace-bg" {...dropHandlers}>
			{/* Hero — Drop Zone: full container height so the card is visually centered */}
			<div className="flex items-center justify-center min-h-full px-2 sm:px-3 relative">
				<div className="flex flex-col items-center gap-6">{emptyState}</div>

				{isDragging && (
					<div className="absolute inset-0 flex items-center justify-center bg-accent-surface/50 backdrop-blur-sm z-20 pointer-events-none">
						<div className="rounded-xl border-2 border-dashed border-accent px-6 py-4 text-sm font-medium text-accent">
							{replaceLabel}
						</div>
					</div>
				)}
			</div>

			{/* Features */}
			<section className="px-4 py-10 sm:py-14">
				<div className="max-w-4xl mx-auto">
					<h2 className="text-center text-lg sm:text-xl font-bold tracking-tight mb-10">What you can do</h2>
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
						{features.map((f, i) => (
							<div
								key={f.title}
								className="rounded-xl border border-border bg-surface/40 p-5 transition-colors hover:bg-surface/60 animate-slide-up"
								style={{ animationDelay: `${i * 60}ms` }}
							>
								<div className="h-9 w-9 rounded-lg bg-accent/8 flex items-center justify-center mb-3">
									<f.icon size={18} className="text-accent" strokeWidth={1.5} />
								</div>
								<h3 className="text-[14px] font-semibold mb-1">{f.title}</h3>
								<p className="text-[13px] text-text-tertiary leading-relaxed">{f.description}</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* Supported Formats */}
			<section className="px-4 py-10 sm:py-14 bg-bg/40">
				<div className="max-w-4xl mx-auto text-center">
					<h2 className="text-lg sm:text-xl font-bold tracking-tight mb-8">Supported formats</h2>
					<div className="flex flex-wrap justify-center gap-2">
						{formats.map((fmt) => (
							<span
								key={fmt}
								className="inline-flex items-center gap-1.5 rounded-md bg-surface/60 border border-border px-3 py-1.5 text-[12px] font-mono text-text-secondary"
							>
								<span className={`h-1.5 w-1.5 rounded-full ${formatColor}`} aria-hidden="true" />
								{fmt}
							</span>
						))}
					</div>
				</div>
			</section>

			{/* FAQ */}
			<section className="px-4 py-10 sm:py-14">
				<div className="max-w-3xl mx-auto">
					<h2 className="text-center text-lg sm:text-xl font-bold tracking-tight mb-8">
						Frequently asked questions
					</h2>
					<div className="flex flex-col gap-2">
						{faqs.map((faq) => (
							<FAQItem key={faq.question} question={faq.question} answer={faq.answer} />
						))}
					</div>
				</div>
			</section>

			{/* Cross-editor links */}
			<section className="px-4 py-10 sm:py-14 bg-bg/40">
				<div className="max-w-3xl mx-auto">
					<h2 className="text-center text-lg sm:text-xl font-bold tracking-tight mb-8">More editing tools</h2>
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
						{crossLinks.map((link) => (
							<Link
								key={link.href}
								to={link.href}
								className={`group flex items-center gap-4 rounded-xl border border-border border-t-2 ${link.borderTop} bg-surface/40 p-5 transition-colors hover:bg-surface/60 cursor-pointer`}
							>
								<div
									className={`h-11 w-11 rounded-xl ${link.accentBg} flex items-center justify-center shrink-0`}
								>
									<link.icon size={20} className={link.accentText} strokeWidth={1.5} />
								</div>
								<div>
									<h3 className="text-[14px] font-semibold">{link.title}</h3>
									<p className="text-[12px] text-text-tertiary">{link.subtitle}</p>
								</div>
							</Link>
						))}
					</div>
				</div>
			</section>

			{/* Minimal footer line */}
			<div className="px-4 py-6 text-center">
				<p className="text-[12px] text-text-tertiary">
					100% client-side &middot; No uploads &middot; Powered by WebAssembly
				</p>
			</div>
		</div>
	);
}
