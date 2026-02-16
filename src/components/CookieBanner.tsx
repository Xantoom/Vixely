import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'vixely-cookies-accepted';

export function CookieBanner() {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		// Show after a short delay, only if not previously accepted
		if (!localStorage.getItem(STORAGE_KEY)) {
			const timer = setTimeout(() => {
				setVisible(true);
			}, 2000);
			return () => {
				clearTimeout(timer);
			};
		}
	}, []);

	const handleAccept = useCallback(() => {
		localStorage.setItem(STORAGE_KEY, '1');
		setVisible(false);
	}, []);

	const handleDismiss = useCallback(() => {
		localStorage.setItem(STORAGE_KEY, '1');
		setVisible(false);
	}, []);

	if (!visible) return null;

	return (
		<div className="fixed bottom-4 right-4 z-40 w-80 rounded-xl border border-border bg-surface p-4 shadow-xl animate-slide-up">
			<div className="flex items-start gap-3">
				<div className="shrink-0 mt-0.5">
					<svg
						className="h-4 w-4 text-text-tertiary"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<circle cx="12" cy="12" r="10" />
						<path d="M12 16v-4M12 8h.01" />
					</svg>
				</div>
				<div className="flex-1 min-w-0">
					<p className="text-[13px] text-text-secondary leading-relaxed">
						We use minimal cookies for preferences and lightweight analytics. No personal data is collected.{' '}
						<a href="/privacy" className="underline text-text-secondary hover:text-text transition-colors">
							Learn more
						</a>
					</p>
					<div className="mt-3 flex items-center gap-2">
						<button
							onClick={handleAccept}
							className="rounded-md bg-accent px-3 py-1.5 text-[13px] font-semibold text-bg transition-colors hover:bg-accent/90 cursor-pointer"
						>
							Accept
						</button>
						<button
							onClick={handleDismiss}
							className="rounded-md px-3 py-1.5 text-[13px] font-medium text-text-tertiary transition-colors hover:text-text-secondary cursor-pointer"
						>
							Dismiss
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
