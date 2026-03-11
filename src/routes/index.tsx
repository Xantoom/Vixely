import { createFileRoute, Link } from '@tanstack/react-router';
import { Video, ImageIcon, Film, ShieldCheck } from 'lucide-react';
import { Seo } from '@/components/Seo.tsx';

export const Route = createFileRoute('/')({ component: HomePage });

const editors = [
	{
		title: 'Video',
		subtitle: 'Trim, resize & export',
		href: '/tools/video' as const,
		icon: Video,
		iconBg: 'bg-blue-500/10',
		iconColor: 'text-blue-400',
		topBorder: 'border-t-blue-500',
		borderHover: 'hover:border-blue-500/25',
		shadowHover: 'group-hover:shadow-[0_8px_60px_-8px_rgba(59,130,246,0.2)]',
	},
	{
		title: 'Image',
		subtitle: 'Crop, adjust & export',
		href: '/tools/image' as const,
		icon: ImageIcon,
		iconBg: 'bg-amber-500/10',
		iconColor: 'text-amber-400',
		topBorder: 'border-t-amber-500',
		borderHover: 'hover:border-amber-500/25',
		shadowHover: 'group-hover:shadow-[0_8px_60px_-8px_rgba(245,158,11,0.2)]',
	},
	{
		title: 'GIF',
		subtitle: 'Edit, optimize & export',
		href: '/tools/gif' as const,
		icon: Film,
		iconBg: 'bg-emerald-500/10',
		iconColor: 'text-emerald-400',
		topBorder: 'border-t-emerald-500',
		borderHover: 'hover:border-emerald-500/25',
		shadowHover: 'group-hover:shadow-[0_8px_60px_-8px_rgba(16,185,129,0.2)]',
	},
] as const;

// Static — hoisted outside component to avoid unnecessary re-renders
const heroBadge = (
	<div className="inline-flex items-center gap-2 mb-7 rounded-full border border-border bg-surface/80 px-3.5 py-1.5 text-[14px] text-text-secondary backdrop-blur-sm animate-slide-up">
		<ShieldCheck size={13} className="text-success shrink-0" strokeWidth={2.5} />
		<span>Everything stays on your device</span>
	</div>
);

function HomePage() {
	return (
		<>
			<Seo
				title="Vixely — Private, Local-First Media Editing Suite"
				description="Edit video, images, and GIFs entirely in your browser. No uploads, no servers. Powered by WebAssembly."
				path="/"
			/>

			<div className="h-full flex flex-col items-center justify-center overflow-hidden bg-home-glow px-4">
				{heroBadge}

				<h1
					className="text-2xl sm:text-3xl font-bold tracking-tight mb-8 animate-slide-up"
					style={{ animationDelay: '60ms' }}
				>
					<span className="text-gradient">What are you editing?</span>
				</h1>

				<nav
					aria-label="Editor tools"
					className="w-full max-w-3xl grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4"
				>
					{editors.map((editor, i) => (
						<Link
							key={editor.href}
							to={editor.href}
							className={`group flex flex-col items-center text-center rounded-2xl border-t-2 ${editor.topBorder} border border-border bg-surface/50 backdrop-blur-sm p-7 sm:p-9 transition-[border-color,box-shadow] duration-300 ${editor.borderHover} ${editor.shadowHover} animate-slide-up focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
							style={{ animationDelay: `${130 + i * 70}ms` }}
						>
							<div
								className={`h-14 w-14 rounded-2xl ${editor.iconBg} flex items-center justify-center mb-4`}
							>
								<editor.icon className={`h-7 w-7 ${editor.iconColor}`} strokeWidth={1.5} />
							</div>
							<h2 className="text-base font-bold tracking-tight mb-1">{editor.title}</h2>
							<p className="text-[14px] text-text-tertiary">{editor.subtitle}</p>
						</Link>
					))}
				</nav>

				<div
					className="mt-5 inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-border bg-surface/60 px-4 py-2 text-[13px] text-text-tertiary backdrop-blur-sm animate-slide-up"
					style={{ animationDelay: '380ms' }}
				>
					<span>Local-first editing</span>
					<span aria-hidden="true" className="h-1 w-1 rounded-full bg-text-tertiary/70" />
					<Link
						to="/privacy"
						className="font-medium text-text-secondary underline decoration-accent/50 underline-offset-4 transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
					>
						Privacy Policy
					</Link>
				</div>
			</div>
		</>
	);
}
