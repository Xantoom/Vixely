import { create } from 'zustand';

const STORAGE_KEY = 'vixely-cookie-consent';

export interface CookieConsent {
	essential: true; // Always true, cannot be disabled
	analytics: boolean;
	advertising: boolean;
}

/** Push consent signals to Google Consent Mode v2 (gtag) */
function updateGoogleConsent(consent: CookieConsent): void {
	if (typeof window.gtag !== 'function') return;
	window.gtag('consent', 'update', {
		ad_storage: consent.advertising ? 'granted' : 'denied',
		ad_user_data: consent.advertising ? 'granted' : 'denied',
		ad_personalization: consent.advertising ? 'granted' : 'denied',
		analytics_storage: consent.analytics ? 'granted' : 'denied',
	});
}

interface CookieConsentState {
	/** null = user hasn't made a choice yet */
	consent: CookieConsent | null;
	/** Whether the banner should be visible */
	bannerVisible: boolean;
	/** Whether the preferences panel is expanded */
	preferencesOpen: boolean;
	accept: (consent: CookieConsent) => void;
	acceptAll: () => void;
	rejectAll: () => void;
	showBanner: () => void;
	hideBanner: () => void;
	togglePreferences: () => void;
	hydrate: () => void;
}

function persistConsent(consent: CookieConsent): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
	} catch {
		// localStorage unavailable — silently ignore
	}
}

function readConsent(): CookieConsent | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== 'object' || parsed === null || !('analytics' in parsed) || !('advertising' in parsed)) {
			return null;
		}
		const record = parsed as Record<string, unknown>;
		if (typeof record.analytics !== 'boolean' || typeof record.advertising !== 'boolean') {
			return null;
		}
		return { essential: true, analytics: record.analytics, advertising: record.advertising };
	} catch {
		return null;
	}
}

export const useCookieConsentStore = create<CookieConsentState>((set) => ({
	consent: null,
	bannerVisible: false,
	preferencesOpen: false,

	accept: (consent) => {
		persistConsent(consent);
		updateGoogleConsent(consent);
		set({ consent, bannerVisible: false, preferencesOpen: false });
	},

	acceptAll: () => {
		const consent: CookieConsent = { essential: true, analytics: true, advertising: true };
		persistConsent(consent);
		updateGoogleConsent(consent);
		set({ consent, bannerVisible: false, preferencesOpen: false });
	},

	rejectAll: () => {
		const consent: CookieConsent = { essential: true, analytics: false, advertising: false };
		persistConsent(consent);
		updateGoogleConsent(consent);
		set({ consent, bannerVisible: false, preferencesOpen: false });
	},

	showBanner: () => {
		set({ bannerVisible: true });
	},

	hideBanner: () => {
		set({ bannerVisible: false, preferencesOpen: false });
	},

	togglePreferences: () => {
		set((s) => ({ preferencesOpen: !s.preferencesOpen }));
	},

	hydrate: () => {
		const saved = readConsent();
		if (saved) {
			updateGoogleConsent(saved);
			set({ consent: saved, bannerVisible: false });
		} else {
			// Delay showing banner slightly for better UX
			setTimeout(() => {
				set({ bannerVisible: true });
			}, 1500);
		}
	},
}));
