import { createRootRoute, Outlet, Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { Video, ImageIcon, Film, Home } from 'lucide-react';
import { useEffect, useRef, useState, useCallback, type MouseEvent as ReactMouseEvent } from 'react';
import { Toaster } from 'sonner';
import { ConfirmResetModal } from '@/components/ConfirmResetModal.tsx';
import { CookieBanner } from '@/components/CookieBanner.tsx';
import { PrivacyModal } from '@/components/PrivacyModal.tsx';
import { useEditorSessionStore, type EditorKey } from '@/stores/editorSession.ts';
import { useEditorUxStore } from '@/stores/editorUx.ts';
import { useGifEditorStore } from '@/stores/gifEditor.ts';
import { useImageEditorStore } from '@/stores/imageEditor.ts';
import { useVideoEditorStore } from '@/stores/videoEditor.ts';

export const Route = createRootRoute({ component: RootLayout });

function AppToaster() {
	useEffect(() => {
		const handleClick = (e: MouseEvent) => {
			if (!(e.target instanceof Element)) return;
			// Let Sonner's own close button handle its click natively
			if (e.target.closest('[data-close-button]')) return;
			const toastEl = e.target.closest('[data-sonner-toast]');
			if (!toastEl) return;
			// Delegate to Sonner's close button so it uses its own dismiss logic
			toastEl.querySelector<HTMLButtonElement>('[data-close-button]')?.click();
		};
		document.addEventListener('click', handleClick);
		return () => {
			document.removeEventListener('click', handleClick);
		};
	}, []);

	return <Toaster position="top-center" closeButton toastOptions={{ duration: 3000 }} gap={8} />;
}

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

type EditorTabRoute = (typeof navItems)[number]['to'];

function editorFromPath(pathname: string): EditorKey | null {
	if (pathname.startsWith('/tools/video')) return 'video';
	if (pathname.startsWith('/tools/image')) return 'image';
	if (pathname.startsWith('/tools/gif')) return 'gif';
	return null;
}

function resetEditorByKey(editor: EditorKey): void {
	if (editor === 'video') {
		useVideoEditorStore.getState().resetAll();
		return;
	}
	if (editor === 'image') {
		useImageEditorStore.getState().clearAll();
		return;
	}
	useGifEditorStore.getState().resetAll();
}

function RootLayout() {
	const navigate = useNavigate();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const isHome = pathname === '/';
	const hydrateEditorUx = useEditorUxStore((s) => s.hydrateFromStorage);
	const unsavedByEditor = useEditorSessionStore((s) => s.unsavedByEditor);
	const setEditorUnsaved = useEditorSessionStore((s) => s.setUnsaved);
	const [pendingEditorRoute, setPendingEditorRoute] = useState<EditorTabRoute | null>(null);
	const [isEditorSwitchConfirmOpen, setIsEditorSwitchConfirmOpen] = useState(false);
	const previousEditorRef = useRef<EditorKey | null>(null);

	useEffect(() => {
		hydrateEditorUx();
	}, [hydrateEditorUx]);

	useEffect(() => {
		const previousEditor = previousEditorRef.current;
		const currentEditor = editorFromPath(pathname);
		if (previousEditor && previousEditor !== currentEditor) {
			resetEditorByKey(previousEditor);
			setEditorUnsaved(previousEditor, false);
		}
		previousEditorRef.current = currentEditor;
	}, [pathname, setEditorUnsaved]);

	const handleEditorTabClick = useCallback(
		(event: ReactMouseEvent, destination: EditorTabRoute) => {
			if (destination === pathname) return;
			const currentEditor = editorFromPath(pathname);
			const nextEditor = editorFromPath(destination);
			if (!currentEditor || !nextEditor || currentEditor === nextEditor) return;
			if (!unsavedByEditor[currentEditor]) return;
			event.preventDefault();
			setPendingEditorRoute(destination);
			setIsEditorSwitchConfirmOpen(true);
		},
		[pathname, unsavedByEditor],
	);

	const handleConfirmEditorSwitch = useCallback(() => {
		if (!pendingEditorRoute) {
			setIsEditorSwitchConfirmOpen(false);
			return;
		}
		const destination = pendingEditorRoute;
		setPendingEditorRoute(null);
		setIsEditorSwitchConfirmOpen(false);
		void navigate({ to: destination });
	}, [navigate, pendingEditorRoute]);

	const handleCancelEditorSwitch = useCallback(() => {
		setPendingEditorRoute(null);
		setIsEditorSwitchConfirmOpen(false);
	}, []);

	return (
		<div className="flex flex-col md:flex-row h-full bg-bg text-text">
			{/* ── Desktop Sidebar ── */}
			<aside className="hidden md:flex w-20 shrink-0 flex-col items-center border-r border-border-subtle bg-bg py-4 gap-1.5">
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
								onClick={(event) => {
									handleEditorTabClick(event, item.to);
								}}
								className={`group relative flex flex-col items-center gap-0.5 rounded-lg py-2.5 transition-all ${
									isActive
										? `${item.activeBg} ${item.activeText}`
										: 'text-text-tertiary hover:text-text-secondary hover:bg-white/3'
								}`}
							>
								<item.icon className="h-5 w-5" />
								<span className="text-[14px] font-semibold tracking-wide uppercase">{item.label}</span>
								{isActive && (
									<div
										className={`absolute left-0 top-1/2 -translate-y-1/2 w-0.75 h-5 rounded-r-full ${item.indicator}`}
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
					className={`flex flex-col items-center gap-0.5 py-3 px-4 min-w-12 transition-all ${
						isHome ? 'text-accent' : 'text-text-tertiary'
					}`}
				>
					<Home className="h-5 w-5" />
					<span className="text-[14px] font-semibold tracking-wide uppercase">Home</span>
				</Link>
				{navItems.map((item) => {
					const isActive = pathname.startsWith(item.to);
					return (
						<Link
							key={item.to}
							to={item.to}
							onClick={(event) => {
								handleEditorTabClick(event, item.to);
							}}
							className={`flex flex-col items-center gap-0.5 py-3 px-4 min-w-12 transition-all ${
								isActive ? item.activeText : 'text-text-tertiary'
							}`}
						>
							<item.icon className="h-5 w-5" />
							<span className="text-[14px] font-semibold tracking-wide uppercase">{item.label}</span>
						</Link>
					);
				})}
			</nav>

			{/* ── Overlays ── */}
			<PrivacyModal />
			<CookieBanner />
			{isEditorSwitchConfirmOpen && (
				<ConfirmResetModal onConfirm={handleConfirmEditorSwitch} onCancel={handleCancelEditorSwitch} />
			)}

			<AppToaster />

			{import.meta.env.DEV && <TanStackRouterDevtools position="bottom-left" />}
		</div>
	);
}
