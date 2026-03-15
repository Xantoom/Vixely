import { Settings, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useCookieConsentStore } from '@/stores/cookieConsent.ts';

export function CookieBanner() {
	const bannerVisible = useCookieConsentStore((s) => s.bannerVisible);
	const preferencesOpen = useCookieConsentStore((s) => s.preferencesOpen);
	const acceptAll = useCookieConsentStore((s) => s.acceptAll);
	const rejectAll = useCookieConsentStore((s) => s.rejectAll);
	const accept = useCookieConsentStore((s) => s.accept);
	const togglePreferences = useCookieConsentStore((s) => s.togglePreferences);
	const hydrate = useCookieConsentStore((s) => s.hydrate);

	const [analytics, setAnalytics] = useState(false);
	const [advertising, setAdvertising] = useState(false);

	useEffect(() => {
		hydrate();
	}, [hydrate]);

	const handleSavePreferences = useCallback(() => {
		accept({ essential: true, analytics, advertising });
	}, [accept, analytics, advertising]);

	if (!bannerVisible) return null;

	return (
		<div
			role="dialog"
			aria-label="Cookie consent"
			className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-lg rounded-2xl border border-border bg-surface p-5 shadow-2xl animate-slide-up sm:left-auto sm:right-4"
		>
			{/* Header */}
			<div className="flex items-start gap-3 mb-3">
				<div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10">
					<ShieldCheck size={16} className="text-accent" strokeWidth={2.5} />
				</div>
				<div>
					<h2 className="text-sm font-semibold text-text">We respect your privacy</h2>
					<p className="mt-1 text-[13px] leading-relaxed text-text-secondary">
						We use essential cookies for the app to function. Optional cookies help us improve the
						experience.{' '}
						<a href="/privacy" className="underline text-text-secondary hover:text-text transition-colors">
							Privacy Policy
						</a>
					</p>
				</div>
			</div>

			{/* Preferences Panel */}
			{preferencesOpen && (
				<div className="mb-4 rounded-xl border border-border bg-bg/50 p-4 space-y-3 animate-slide-up-fade">
					<PreferenceRow
						label="Essential"
						description="Required for the app to work"
						checked={true}
						disabled={true}
					/>
					<PreferenceRow
						label="Analytics"
						description="Help us understand how the app is used"
						checked={analytics}
						onChange={setAnalytics}
					/>
					<PreferenceRow
						label="Advertising"
						description="Show relevant ads to support the project"
						checked={advertising}
						onChange={setAdvertising}
					/>
					<button
						onClick={handleSavePreferences}
						className="mt-2 w-full rounded-lg border border-accent bg-accent/10 px-4 py-2 text-[13px] font-semibold text-accent transition-colors hover:bg-accent/20 cursor-pointer"
					>
						Save Preferences
					</button>
				</div>
			)}

			{/* Action Buttons — Accept & Reject have EQUAL prominence (GDPR/CNIL requirement) */}
			<div className="flex items-center gap-2">
				<button
					onClick={rejectAll}
					className="flex-1 rounded-lg border border-border bg-surface-raised px-4 py-2.5 text-[13px] font-semibold text-text transition-colors hover:bg-surface-raised/80 cursor-pointer"
				>
					Reject All
				</button>
				<button
					onClick={acceptAll}
					className="flex-1 rounded-lg border border-border bg-surface-raised px-4 py-2.5 text-[13px] font-semibold text-text transition-colors hover:bg-surface-raised/80 cursor-pointer"
				>
					Accept All
				</button>
				<button
					onClick={togglePreferences}
					aria-label="Manage cookie preferences"
					className="shrink-0 rounded-lg border border-border bg-surface-raised p-2.5 text-text-tertiary transition-colors hover:text-text-secondary hover:bg-surface-raised/80 cursor-pointer"
				>
					<Settings size={16} />
				</button>
			</div>
		</div>
	);
}

function PreferenceRow({
	label,
	description,
	checked,
	disabled,
	onChange,
}: {
	label: string;
	description: string;
	checked: boolean;
	disabled?: boolean;
	onChange?: (v: boolean) => void;
}) {
	return (
		<label className={`flex items-center justify-between gap-3 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
			<div>
				<span className="text-[13px] font-medium text-text">{label}</span>
				<p className="text-[12px] text-text-tertiary">{description}</p>
			</div>
			<input
				type="checkbox"
				checked={checked}
				disabled={disabled}
				onChange={(e) => onChange?.(e.target.checked)}
				className="h-4 w-4 shrink-0 cursor-pointer rounded border-border accent-accent disabled:cursor-not-allowed"
			/>
		</label>
	);
}
