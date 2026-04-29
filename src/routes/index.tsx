import { createFileRoute, Link } from '@tanstack/react-router';
import { Video, ImageIcon, Film, ShieldCheck, Cpu, Zap, Palette, MonitorSmartphone, Upload } from 'lucide-react';
import { Logo } from '@/components/Logo.tsx';
import { Seo, buildWebAppSchema, buildFAQSchema, buildWebSiteSchema } from '@/components/Seo.tsx';
import { FAQItem } from '@/components/ui/FAQItem.tsx';

export const Route = createFileRoute('/')({ component: HomePage });

/* ── Data ── */

const editors = [
	{
		title: 'Video Editor',
		subtitle: 'Trim, resize, adjust colors & export',
		href: '/tools/video' as const,
		icon: Video,
		accent: 'blue',
		iconBg: 'bg-blue-500/10',
		iconColor: 'text-blue-400',
		topBorder: 'border-t-blue-500',
		borderHover: 'hover:border-blue-500/25',
		shadowHover: 'group-hover:shadow-[0_8px_60px_-8px_rgba(59,130,246,0.2)]',
	},
	{
		title: 'Image Editor',
		subtitle: 'Crop, adjust, filter & export',
		href: '/tools/image' as const,
		icon: ImageIcon,
		accent: 'amber',
		iconBg: 'bg-amber-500/10',
		iconColor: 'text-amber-400',
		topBorder: 'border-t-amber-500',
		borderHover: 'hover:border-amber-500/25',
		shadowHover: 'group-hover:shadow-[0_8px_60px_-8px_rgba(245,158,11,0.2)]',
	},
	{
		title: 'GIF Editor',
		subtitle: 'Optimize, trim, crop & export',
		href: '/tools/gif' as const,
		icon: Film,
		accent: 'emerald',
		iconBg: 'bg-emerald-500/10',
		iconColor: 'text-emerald-400',
		topBorder: 'border-t-emerald-500',
		borderHover: 'hover:border-emerald-500/25',
		shadowHover: 'group-hover:shadow-[0_8px_60px_-8px_rgba(16,185,129,0.2)]',
	},
] as const;

const features = [
	{
		icon: ShieldCheck,
		title: '100% Private',
		description: 'Your files never leave your device. Zero uploads, zero servers, zero tracking.',
	},
	{
		icon: Cpu,
		title: 'Hardware-Accelerated',
		description:
			'Native WebCodecs, WebGL2 and Mediabunny pipeline delivers near-native performance directly in your browser with real-time preview.',
	},
	{ icon: Zap, title: 'Instant Export', description: 'Export in any format without waiting for server processing.' },
	{
		icon: Palette,
		title: 'Color Correction',
		description: 'Professional color grading with brightness, contrast, saturation and filters.',
	},
	{
		icon: MonitorSmartphone,
		title: 'Platform Presets',
		description: 'One-click presets for Discord, TikTok, YouTube, Twitter and more.',
	},
	{
		icon: Upload,
		title: 'No Sign-Up Required',
		description: 'Start editing immediately. No account, no email, no registration needed.',
	},
] as const;

const steps = [
	{ number: '01', title: 'Drop your file', description: 'Drag & drop any video, image, or GIF into the editor.' },
	{
		number: '02',
		title: 'Edit in real-time',
		description: 'Trim, crop, resize, adjust colors with instant preview.',
	},
	{ number: '03', title: 'Export anywhere', description: 'Choose your format, quality, and download instantly.' },
] as const;

const formats = {
	video: ['MP4', 'WebM', 'MKV', 'AVI', 'MOV', 'FLV', 'WMV', 'OGV'],
	image: ['PNG', 'JPG', 'WebP', 'AVIF', 'BMP', 'TIFF', 'ICO'],
	gif: ['GIF', 'APNG', 'WebP (animated)'],
} as const;

const faqs = [
	{
		question: 'Is Vixely really free?',
		answer: 'Yes, Vixely is completely free to use. All editing features are available without any payment, subscription, or hidden costs.',
	},
	{
		question: 'Are my files uploaded to a server?',
		answer: 'No. Vixely processes everything locally in your browser using native WebCodecs, WebGL2 and the Mediabunny library. Your files never leave your device — we have zero access to your media.',
	},
	{
		question: 'What formats does Vixely support?',
		answer: 'Vixely supports a wide range of formats including MP4, WebM, MKV, AVI, MOV for video; PNG, JPG, WebP, AVIF for images; and GIF, APNG for animations. Export is available in all major formats.',
	},
	{
		question: 'Do I need to create an account?',
		answer: 'No account is required. Just open Vixely in your browser and start editing immediately. No registration, no email, no sign-up of any kind.',
	},
	{
		question: 'How does browser-based editing work?',
		answer: 'Vixely uses native browser APIs — WebCodecs for hardware-accelerated video decoding/encoding, WebGL2 for real-time filtering, Web Audio API for sound, and the Mediabunny library for container I/O. This delivers near-native performance without installing software or uploading files.',
	},
	{
		question: 'Is Vixely safe to use?',
		answer: 'Absolutely. Since all processing happens locally on your device, there is no risk of data breach or unauthorized access. Your files stay completely private.',
	},
	{
		question: 'Can I export for social media platforms?',
		answer: 'Yes. Vixely includes built-in presets optimized for Discord, TikTok, YouTube, Twitter, and other platforms with the correct resolution, file size limits, and codec settings.',
	},
	{
		question: 'Does Vixely work on mobile?',
		answer: 'Yes, Vixely is fully responsive and works on mobile devices and tablets. The interface adapts to your screen size for the best editing experience on any device.',
	},
] as const;

/* ── Component ── */

function HomePage() {
	return (
		<>
			<Seo
				title="Vixely — Free Online Video, Image & GIF Editor"
				description="Free online video, image and GIF editor. Trim, crop, resize, color-correct, add filters and export MP4, WebM, PNG, GIF and more — directly in your browser. No upload, 100% private, powered by native WebCodecs, WebGL2 and the Mediabunny library."
				path="/"
				jsonLd={[
					buildWebAppSchema(
						'Vixely',
						'Free online video, image and GIF editor. Trim, crop, resize, color-correct and export directly in your browser. No upload, 100% private, powered by native WebCodecs, WebGL2 and the Mediabunny library.',
						'https://vixely.app',
					),
					buildFAQSchema(faqs.map((f) => ({ question: f.question, answer: f.answer }))),
					buildWebSiteSchema(),
				]}
			/>

			<div className="h-full overflow-y-auto scroll-smooth">
				<HeroSection />
				<FeaturesSection />
				<HowItWorksSection />
				<FormatsSection />
				<FAQSection />
				<FooterSection />
			</div>
		</>
	);
}

/* ── Hero ── */

function HeroSection() {
	return (
		<section className="relative flex flex-col items-center justify-center min-h-[calc(100dvh-64px)] md:min-h-dvh px-4 py-20 bg-home-glow overflow-hidden">
			{/* Subtle grid background */}
			<div className="absolute inset-0 landing-grid pointer-events-none" aria-hidden="true" />

			<div className="relative z-10 flex flex-col items-center text-center max-w-4xl mx-auto">
				{/* Badge */}
				<div className="inline-flex items-center gap-2 mb-7 rounded-full border border-border bg-surface/80 px-3.5 py-1.5 text-[13px] text-text-secondary backdrop-blur-sm animate-slide-up">
					<ShieldCheck size={13} className="text-success shrink-0" strokeWidth={2.5} />
					<span>100% client-side processing</span>
					<span aria-hidden="true" className="h-1 w-1 rounded-full bg-text-tertiary/70" />
					<span>No uploads</span>
				</div>

				{/* H1 */}
				<h1
					className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight leading-tight mb-4 animate-slide-up"
					style={{ animationDelay: '60ms' }}
				>
					<span className="text-gradient">Edit Videos, Images & GIFs</span>
					<br />
					<span className="text-text">Online for Free</span>
				</h1>

				{/* Subtitle */}
				<p
					className="max-w-xl text-[15px] sm:text-base text-text-secondary leading-relaxed mb-10 animate-slide-up"
					style={{ animationDelay: '120ms' }}
				>
					Powerful media editing that runs entirely in your browser. No uploads, no servers, no sign-up —
					powered by native WebCodecs, WebGL2 and Mediabunny.
				</p>

				{/* Editor Cards */}
				<nav
					aria-label="Editor tools"
					className="w-full max-w-3xl grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4"
				>
					{editors.map((editor, i) => (
						<Link
							key={editor.href}
							to={editor.href}
							className={`group flex flex-col items-center text-center rounded-2xl border-t-2 ${editor.topBorder} border border-border bg-surface/50 backdrop-blur-sm p-7 sm:p-9 transition-[border-color,box-shadow] duration-300 ${editor.borderHover} ${editor.shadowHover} animate-slide-up cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
							style={{ animationDelay: `${180 + i * 70}ms` }}
						>
							<div
								className={`h-14 w-14 rounded-2xl ${editor.iconBg} flex items-center justify-center mb-4`}
							>
								<editor.icon className={`h-7 w-7 ${editor.iconColor}`} strokeWidth={1.5} />
							</div>
							<h2 className="text-base font-bold tracking-tight mb-1">{editor.title}</h2>
							<p className="text-[13px] text-text-tertiary">{editor.subtitle}</p>
						</Link>
					))}
				</nav>
			</div>
		</section>
	);
}

/* ── Features ── */

function FeaturesSection() {
	return (
		<section className="px-4 py-20 sm:py-28 bg-bg">
			<div className="max-w-5xl mx-auto">
				<div className="text-center mb-14">
					<h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-3">
						Everything you need, nothing you don't
					</h2>
					<p className="text-[15px] text-text-secondary max-w-lg mx-auto">
						Professional editing tools that respect your privacy and work at native speed.
					</p>
				</div>

				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{features.map((feature) => (
						<div
							key={feature.title}
							className="rounded-xl border border-border bg-surface/40 p-6 transition-colors hover:bg-surface/60"
						>
							<div className="h-10 w-10 rounded-lg bg-accent/8 flex items-center justify-center mb-4">
								<feature.icon size={20} className="text-accent" strokeWidth={1.5} />
							</div>
							<h3 className="text-[15px] font-semibold mb-1.5">{feature.title}</h3>
							<p className="text-[13px] text-text-tertiary leading-relaxed">{feature.description}</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}

/* ── How It Works ── */

function HowItWorksSection() {
	return (
		<section className="px-4 py-20 sm:py-28 bg-surface/30">
			<div className="max-w-4xl mx-auto">
				<div className="text-center mb-14">
					<h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-3">How it works</h2>
					<p className="text-[15px] text-text-secondary">Three steps. No learning curve.</p>
				</div>

				<div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
					{steps.map((step) => (
						<div key={step.number} className="text-center sm:text-left">
							<div className="text-3xl font-bold text-accent/20 mb-3 font-mono">{step.number}</div>
							<h3 className="text-[15px] font-semibold mb-2">{step.title}</h3>
							<p className="text-[13px] text-text-tertiary leading-relaxed">{step.description}</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}

/* ── Supported Formats ── */

function FormatsSection() {
	return (
		<section className="px-4 py-20 sm:py-28 bg-bg">
			<div className="max-w-4xl mx-auto">
				<div className="text-center mb-14">
					<h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-3">Supported formats</h2>
					<p className="text-[15px] text-text-secondary">Import and export in all major media formats.</p>
				</div>

				<div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
					<FormatGroup title="Video" color="blue" formats={formats.video} />
					<FormatGroup title="Image" color="amber" formats={formats.image} />
					<FormatGroup title="GIF & Animation" color="emerald" formats={formats.gif} />
				</div>
			</div>
		</section>
	);
}

const formatColors = {
	blue: { border: 'border-t-blue-500', dot: 'bg-blue-400' },
	amber: { border: 'border-t-amber-500', dot: 'bg-amber-400' },
	emerald: { border: 'border-t-emerald-500', dot: 'bg-emerald-400' },
} as const;

function FormatGroup({
	title,
	color,
	formats: fmts,
}: {
	title: string;
	color: keyof typeof formatColors;
	formats: readonly string[];
}) {
	const colors = formatColors[color];
	return (
		<div className={`rounded-xl border border-border border-t-2 ${colors.border} bg-surface/40 p-5`}>
			<h3 className="text-[14px] font-semibold mb-3">{title}</h3>
			<div className="flex flex-wrap gap-2">
				{fmts.map((fmt) => (
					<span
						key={fmt}
						className="inline-flex items-center gap-1.5 rounded-md bg-bg/60 border border-border px-2.5 py-1 text-[12px] font-mono text-text-secondary"
					>
						<span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} aria-hidden="true" />
						{fmt}
					</span>
				))}
			</div>
		</div>
	);
}

/* ── FAQ ── */

function FAQSection() {
	return (
		<section className="px-4 py-20 sm:py-28 bg-surface/30">
			<div className="max-w-3xl mx-auto">
				<div className="text-center mb-14">
					<h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-3">Frequently asked questions</h2>
					<p className="text-[15px] text-text-secondary">Everything you need to know about Vixely.</p>
				</div>

				<div className="flex flex-col gap-2">
					{faqs.map((faq) => (
						<FAQItem key={faq.question} question={faq.question} answer={faq.answer} />
					))}
				</div>
			</div>
		</section>
	);
}

/* ── Footer ── */

function FooterSection() {
	return (
		<footer className="px-4 py-12 bg-bg border-t border-border">
			<div className="max-w-5xl mx-auto">
				<div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-10">
					{/* Brand */}
					<div className="col-span-2 sm:col-span-1">
						<div className="flex items-center gap-2 mb-3">
							<Logo className="h-7 w-7" />
							<span className="text-[15px] font-bold">Vixely</span>
						</div>
						<p className="text-[12px] text-text-tertiary leading-relaxed">
							Free, private media editing powered by native browser APIs.
						</p>
					</div>

					{/* Tools */}
					<div>
						<h4 className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mb-3">
							Tools
						</h4>
						<nav className="flex flex-col gap-2">
							<Link
								to="/tools/video"
								className="text-[13px] text-text-secondary hover:text-text transition-colors"
							>
								Video Editor
							</Link>
							<Link
								to="/tools/image"
								className="text-[13px] text-text-secondary hover:text-text transition-colors"
							>
								Image Editor
							</Link>
							<Link
								to="/tools/gif"
								className="text-[13px] text-text-secondary hover:text-text transition-colors"
							>
								GIF Editor
							</Link>
						</nav>
					</div>

					{/* Legal */}
					<div>
						<h4 className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mb-3">
							Legal
						</h4>
						<nav className="flex flex-col gap-2">
							<Link
								to="/privacy"
								className="text-[13px] text-text-secondary hover:text-text transition-colors"
							>
								Privacy Policy
							</Link>
							<Link
								to="/terms"
								className="text-[13px] text-text-secondary hover:text-text transition-colors"
							>
								Terms of Use
							</Link>
							<Link
								to="/legal"
								className="text-[13px] text-text-secondary hover:text-text transition-colors"
							>
								Legal Notice
							</Link>
						</nav>
					</div>

					{/* Info */}
					<div>
						<h4 className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mb-3">
							About
						</h4>
						<nav className="flex flex-col gap-2">
							<Link
								to="/about"
								className="text-[13px] text-text-secondary hover:text-text transition-colors"
							>
								About Vixely
							</Link>
							<span className="text-[13px] text-text-tertiary">Made with WebCodecs &amp; Mediabunny</span>
							<span className="text-[13px] text-text-tertiary">GDPR compliant</span>
						</nav>
					</div>
				</div>

				{/* Bottom bar */}
				<div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 border-t border-border">
					<p className="text-[12px] text-text-tertiary">
						&copy; {new Date().getFullYear()} Vixely. All rights reserved.
					</p>
					<div className="flex items-center gap-1.5 text-[12px] text-text-tertiary">
						<span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-soft" />
						All processing runs locally
					</div>
				</div>
			</div>
		</footer>
	);
}
