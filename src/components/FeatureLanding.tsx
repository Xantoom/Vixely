import { Link } from '@tanstack/react-router';
import { ArrowRight, ShieldCheck, Zap, Cpu } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { FAQItem } from '@/components/ui/FAQItem.tsx';

export interface FeatureLandingProps {
	accent: 'blue' | 'amber' | 'emerald';
	icon: LucideIcon;
	heading: string;
	tagline: string;
	ctaLabel: string;
	ctaHref: '/tools/video' | '/tools/image' | '/tools/gif';
	bullets: { title: string; description: string }[];
	faqs: { question: string; answer: string }[];
	crossLinks: {
		title: string;
		subtitle: string;
		href: '/tools/video' | '/tools/image' | '/tools/gif';
		icon: LucideIcon;
	}[];
}

const accentStyles = {
	blue: {
		iconBg: 'bg-blue-500/10',
		iconColor: 'text-blue-400',
		cta: 'bg-blue-500 hover:bg-blue-500/90',
		topBorder: 'border-t-blue-500',
	},
	amber: {
		iconBg: 'bg-amber-500/10',
		iconColor: 'text-amber-400',
		cta: 'bg-amber-500 hover:bg-amber-500/90',
		topBorder: 'border-t-amber-500',
	},
	emerald: {
		iconBg: 'bg-emerald-500/10',
		iconColor: 'text-emerald-400',
		cta: 'bg-emerald-500 hover:bg-emerald-500/90',
		topBorder: 'border-t-emerald-500',
	},
} as const;

const defaultTrustBadges = [
	{ icon: ShieldCheck, label: '100% private — no upload' },
	{ icon: Cpu, label: 'Hardware-accelerated' },
	{ icon: Zap, label: 'No sign-up required' },
];

export function FeatureLanding({
	accent,
	icon: Icon,
	heading,
	tagline,
	ctaLabel,
	ctaHref,
	bullets,
	faqs,
	crossLinks,
}: FeatureLandingProps) {
	const styles = accentStyles[accent];

	return (
		<div className="h-full overflow-y-auto bg-bg">
			{/* Hero */}
			<section className="relative px-4 py-16 sm:py-24 bg-home-glow overflow-hidden">
				<div className="absolute inset-0 landing-grid pointer-events-none" aria-hidden="true" />
				<div className="relative z-10 max-w-3xl mx-auto text-center">
					<div
						className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl ${styles.iconBg} mb-6`}
					>
						<Icon className={`h-7 w-7 ${styles.iconColor}`} strokeWidth={1.5} />
					</div>
					<h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight leading-tight mb-4">
						{heading}
					</h1>
					<p className="text-[15px] sm:text-base text-text-secondary leading-relaxed mb-8 max-w-xl mx-auto">
						{tagline}
					</p>
					<Link
						to={ctaHref}
						className={`inline-flex items-center gap-2 rounded-xl ${styles.cta} px-5 py-3 text-[14px] font-semibold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60`}
					>
						{ctaLabel}
						<ArrowRight size={16} strokeWidth={2.2} />
					</Link>
					<div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] text-text-tertiary">
						{defaultTrustBadges.map((badge) => (
							<span key={badge.label} className="inline-flex items-center gap-1.5">
								<badge.icon size={13} className="text-success" strokeWidth={2.2} />
								{badge.label}
							</span>
						))}
					</div>
				</div>
			</section>

			{/* Bullets */}
			<section className="px-4 py-16 sm:py-20">
				<div className="max-w-4xl mx-auto">
					<h2 className="text-center text-lg sm:text-xl font-bold tracking-tight mb-10">
						Why Vixely for this task
					</h2>
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						{bullets.map((b) => (
							<div key={b.title} className="rounded-xl border border-border bg-surface/40 p-5">
								<h3 className="text-[14px] font-semibold mb-1.5">{b.title}</h3>
								<p className="text-[13px] text-text-tertiary leading-relaxed">{b.description}</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* FAQ */}
			<section className="px-4 py-16 sm:py-20 bg-surface/30">
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

			{/* Cross-links */}
			<section className="px-4 py-16 sm:py-20">
				<div className="max-w-3xl mx-auto">
					<h2 className="text-center text-lg sm:text-xl font-bold tracking-tight mb-8">Related editors</h2>
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
						{crossLinks.map((link) => (
							<Link
								key={link.href}
								to={link.href}
								className={`group flex items-center gap-3 rounded-xl border border-border border-t-2 ${styles.topBorder} bg-surface/40 p-4 transition-colors hover:bg-surface/60`}
							>
								<div
									className={`h-10 w-10 rounded-xl ${styles.iconBg} flex items-center justify-center shrink-0`}
								>
									<link.icon size={18} className={styles.iconColor} strokeWidth={1.5} />
								</div>
								<div>
									<h3 className="text-[13px] font-semibold">{link.title}</h3>
									<p className="text-[12px] text-text-tertiary">{link.subtitle}</p>
								</div>
							</Link>
						))}
					</div>
				</div>
			</section>

			{/* Footer note */}
			<div className="px-4 py-8 text-center border-t border-border">
				<p className="text-[12px] text-text-tertiary">
					100% client-side &middot; No uploads &middot; Powered by WebCodecs &amp; WebGL2
				</p>
			</div>
		</div>
	);
}
