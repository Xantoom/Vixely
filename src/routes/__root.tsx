import { createRootRoute, Outlet, Link, useRouterState } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { Video, ImageIcon, Film, Home } from 'lucide-react';
import { Toaster } from 'sonner';
import { CookieBanner } from '@/components/CookieBanner.tsx';
import { PrivacyModal } from '@/components/PrivacyModal.tsx';

export const Route = createRootRoute({ component: RootLayout });

const navItems = [
	{
		to: '/tools/video' as const,
		label: 'Video',
		icon: Video,
		activeText: 'text-blue-500',
		activeBg: 'bg-blue-500/10',
		indicator: 'bg-blue-500',
	},
	{
		to: '/tools/image' as const,
		label: 'Image',
		icon: ImageIcon,
		activeText: 'text-amber-500',
		activeBg: 'bg-amber-500/10',
		indicator: 'bg-amber-500',
	},
	{
		to: '/tools/gif' as const,
		label: 'GIF',
		icon: Film,
		activeText: 'text-emerald-500',
		activeBg: 'bg-emerald-500/10',
		indicator: 'bg-emerald-500',
	},
];

function RootLayout() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const isHome = pathname === '/';

	return (
		<div className="flex flex-col md:flex-row h-full bg-bg text-text">
			{/* ── Desktop Sidebar ── */}
			<aside className="hidden md:flex w-16 shrink-0 flex-col items-center border-r border-border-subtle bg-bg py-4 gap-1">
				{/* Logo */}
				<Link to="/" className="mb-6 group flex items-center justify-center">
					<div className="h-9 w-9 rounded-xl gradient-accent flex items-center justify-center transition-transform group-hover:scale-105">
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
							<path
								d="M3 3.5l5 9 5-9"
								stroke="white"
								strokeWidth="2.5"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					</div>
				</Link>

				{/* Nav */}
				<nav className="flex flex-col gap-1 w-full px-2">
					{navItems.map((item) => {
						const isActive = pathname.startsWith(item.to);
						return (
							<Link
								key={item.to}
								to={item.to}
								className={`group relative flex flex-col items-center gap-0.5 rounded-lg py-2.5 transition-all ${
									isActive
										? `${item.activeBg} ${item.activeText}`
										: 'text-text-tertiary hover:text-text-secondary hover:bg-white/[0.03]'
								}`}
							>
								<item.icon className="h-5 w-5" />
								<span className="text-[11px] font-semibold tracking-wide uppercase">{item.label}</span>
								{isActive && (
									<div
										className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full ${item.indicator}`}
									/>
								)}
							</Link>
						);
					})}
				</nav>

				{/* Bottom spacer */}
				<div className="mt-auto flex flex-col items-center gap-3 pb-2">
					<div
						className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-soft"
						title="All processing local"
					/>
				</div>
			</aside>

			{/* ── Main Content ── */}
			<main className="flex-1 flex flex-col overflow-hidden min-h-0">
				<div className="flex-1 min-h-0">
					<Outlet />
				</div>
			</main>

			{/* ── Mobile Bottom Tab Bar ── */}
			<nav className="md:hidden shrink-0 flex items-center justify-around border-t border-border-subtle bg-bg safe-area-bottom">
				<Link
					to="/"
					className={`flex flex-col items-center gap-0.5 py-3 px-4 min-w-[3rem] transition-all ${
						isHome ? 'text-accent' : 'text-text-tertiary'
					}`}
				>
					<Home className="h-5 w-5" />
					<span className="text-[11px] font-semibold tracking-wide uppercase">Home</span>
				</Link>
				{navItems.map((item) => {
					const isActive = pathname.startsWith(item.to);
					return (
						<Link
							key={item.to}
							to={item.to}
							className={`flex flex-col items-center gap-0.5 py-3 px-4 min-w-[3rem] transition-all ${
								isActive ? item.activeText : 'text-text-tertiary'
							}`}
						>
							<item.icon className="h-5 w-5" />
							<span className="text-[11px] font-semibold tracking-wide uppercase">{item.label}</span>
						</Link>
					);
				})}
			</nav>

			{/* ── Overlays ── */}
			<PrivacyModal />
			<CookieBanner />

			<Toaster position="bottom-right" toastOptions={{ duration: 3000 }} gap={8} />

			{import.meta.env.DEV && <TanStackRouterDevtools position="bottom-left" />}
		</div>
	);
}
