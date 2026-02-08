import { useState, useEffect } from 'react';

/**
 * Detect whether an adblocker is active by checking if the AdSense
 * global loaded successfully. Gracefully collapses ad containers
 * when blocked — no nagging.
 */
export function useAdBlockDetector(): { isBlocked: boolean; checked: boolean } {
	const [state, setState] = useState({ isBlocked: false, checked: false });

	useEffect(() => {
		const timer = setTimeout(() => {
			const blocked = !(window as any).adsbygoogle;
			setState({ isBlocked: blocked, checked: true });
		}, 2000);

		return () => clearTimeout(timer);
	}, []);

	return state;
}
