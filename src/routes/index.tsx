import { createFileRoute, Link } from '@tanstack/react-router';
import { Video, ImageIcon, Film, ArrowRight } from 'lucide-react';
import { Helmet } from 'react-helmet-async';

export const Route = createFileRoute('/')({ component: HomePage });

const editors = [
	{
		title: 'Video',
		desc: 'Cut, trim, resize, color correction & effects. Export with full codec and quality control.',
		features: ['Cut/Trim', 'Resize', 'Color Grading', 'Export'],
		href: '/tools/video' as const,
		icon: Video,
		accent: 'border-t-blue-500',
		hoverBorder: 'hover:border-blue-500/20',
		hoverGlow: 'group-hover:shadow-[0_4px_40px_-4px_rgba(59,130,246,0.25)]',
		iconColor: 'text-blue-400',
		iconBg: 'bg-blue-500/10',
		tagColor: 'bg-blue-500/[0.08] text-blue-400/80',
	},
	{
		title: 'Image',
		desc: 'Resize, adjust brightness, contrast, saturation & more. Export as PNG, JPEG, or WebP.',
		features: ['Resize', 'Color Correction', 'Effects', 'Multi-format'],
		href: '/tools/image' as const,
		icon: ImageIcon,
		accent: 'border-t-amber-500',
		hoverBorder: 'hover:border-amber-500/20',
		hoverGlow: 'group-hover:shadow-[0_4px_40px_-4px_rgba(245,158,11,0.25)]',
		iconColor: 'text-amber-400',
		iconBg: 'bg-amber-500/10',
		tagColor: 'bg-amber-500/[0.08] text-amber-400/80',
	},
	{
		title: 'GIF',
		desc: 'Create GIFs from video. Control frames, framerate, speed, and palette optimization.',
		features: ['Video to GIF', 'Frame Control', 'Speed', 'Palette'],
		href: '/tools/gif' as const,
		icon: Film,
		accent: 'border-t-emerald-500',
		hoverBorder: 'hover:border-emerald-500/20',
		hoverGlow: 'group-hover:shadow-[0_4px_40px_-4px_rgba(16,185,129,0.25)]',
		iconColor: 'text-emerald-400',
		iconBg: 'bg-emerald-500/10',
		tagColor: 'bg-emerald-500/[0.08] text-emerald-400/80',
	},
];

function HomePage() {
	return (
		<>
			<Helmet>
				<title>Vixely — Private, Local-First Media Editing Suite</title>
				<meta
					name="description"
					content="Edit video, images, and GIFs entirely in your browser. No uploads, no servers. Powered by WebAssembly."
				/>
			</Helmet>

			<div className="h-full flex flex-col items-center justify-center overflow-hidden bg-home-glow animate-fade-in">
				{/* Header */}
				<div className="shrink-0 text-center mb-6 sm:mb-10 px-4">
					<div className="inline-flex items-center gap-2 mb-4 rounded-full border border-border bg-surface/80 px-3.5 py-1.5 text-xs text-text-secondary">
						<span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-soft" />
						Everything stays on your device
					</div>
					<h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight leading-tight">
						<span className="text-gradient">What are you editing?</span>
					</h1>
				</div>

				{/* Cards */}
				<div className="w-full max-w-5xl px-4 sm:px-8 grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-5">
					{editors.map((editor) => (
						<Link
							key={editor.href}
							to={editor.href}
							className={`group relative flex flex-col rounded-2xl border-t-2 ${editor.accent} border border-border bg-surface/50 backdrop-blur-sm p-5 sm:p-7 transition-all duration-300 ${editor.hoverBorder} ${editor.hoverGlow}`}
						>
							{/* Icon */}
							<div
								className={`h-11 w-11 rounded-xl ${editor.iconBg} flex items-center justify-center mb-4`}
							>
								<editor.icon className={`h-5 w-5 ${editor.iconColor}`} strokeWidth={1.8} />
							</div>

							{/* Title + Arrow */}
							<div className="flex items-center gap-2 mb-2">
								<h2 className="text-lg font-bold tracking-tight">{editor.title}</h2>
								<ArrowRight
									size={16}
									className="text-text-tertiary opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200"
								/>
							</div>

							{/* Description */}
							<p className="text-[15px] text-text-secondary leading-relaxed">{editor.desc}</p>

							{/* Feature tags */}
							<div className="mt-auto pt-5 flex flex-wrap gap-1.5">
								{editor.features.map((f) => (
									<span
										key={f}
										className={`rounded-md px-2 py-0.5 text-[12px] font-medium ${editor.tagColor}`}
									>
										{f}
									</span>
								))}
							</div>
						</Link>
					))}
				</div>
			</div>
		</>
	);
}
