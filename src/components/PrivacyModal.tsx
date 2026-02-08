import { Shield, Check } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/index.ts';

const STORAGE_KEY = 'vixely-privacy-acknowledged';

export function PrivacyModal() {
	const [open, setOpen] = useState(false);

	useEffect(() => {
		if (!localStorage.getItem(STORAGE_KEY)) {
			setOpen(true);
		}
	}, []);

	const handleAccept = useCallback(() => {
		localStorage.setItem(STORAGE_KEY, '1');
		setOpen(false);
	}, []);

	if (!open) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
			<div className="relative w-full max-w-md mx-4 rounded-2xl border border-border bg-surface p-8 animate-scale-in shadow-2xl">
				{/* Icon */}
				<div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl gradient-accent">
					<Shield size={24} className="text-white" />
				</div>

				<h2 className="text-center text-lg font-bold">Your files stay with you</h2>

				<p className="mt-3 text-center text-sm text-text-secondary leading-relaxed">
					Vixely is a <strong className="text-text">local-first</strong> tool. Your files{' '}
					<strong className="text-text">never</strong> leave your device. All processing happens right here in
					your browser using WebAssembly.
				</p>

				<ul className="mt-5 flex flex-col gap-2">
					{[
						'No uploads — everything runs client-side',
						'No accounts or tracking required',
						'No data is collected or stored on any server',
					].map((item) => (
						<li key={item} className="flex items-start gap-2.5 text-xs text-text-secondary">
							<Check size={16} className="shrink-0 text-success mt-0.5" />
							{item}
						</li>
					))}
				</ul>

				<Button className="mt-6 w-full" onClick={handleAccept}>
					Got it
				</Button>

				<p className="mt-3 text-center text-[10px] text-text-tertiary">
					Read our full{' '}
					<a href="/privacy" className="underline hover:text-text-secondary transition-colors">
						Privacy Policy
					</a>
				</p>
			</div>
		</div>
	);
}
