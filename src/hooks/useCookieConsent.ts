import { useCookieConsentStore } from '@/stores/cookieConsent.ts';

/**
 * Convenience hook: returns whether a specific cookie category is allowed.
 * Use this to conditionally load third-party scripts (GA, AdSense, etc.).
 *
 * @example
 * const { analyticsAllowed, advertisingAllowed } = useCookieConsent();
 * useEffect(() => { if (analyticsAllowed) loadGA(); }, [analyticsAllowed]);
 */
export function useCookieConsent() {
	const consent = useCookieConsentStore((s) => s.consent);

	return {
		/** User has made a choice (accepted or rejected) */
		hasConsented: consent !== null,
		/** Analytics cookies are allowed */
		analyticsAllowed: consent?.analytics ?? false,
		/** Advertising cookies are allowed */
		advertisingAllowed: consent?.advertising ?? false,
	};
}
