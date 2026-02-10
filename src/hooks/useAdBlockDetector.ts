import { useState, useEffect } from 'react';

/**
 * Detect whether an adblocker is active using a bait-element approach.
 * Works with any ad network (Monetag, AdSense, etc.).
 * Gracefully collapses ad containers when blocked — no nagging.
 */
export function useAdBlockDetector(): { isBlocked: boolean; checked: boolean } {
	const [state, setState] = useState({ isBlocked: false, checked: false });

	useEffect(() => {
		const timer = setTimeout(() => {
			const bait = document.createElement('div');
			bait.className = 'ad-banner textad banner-ad ads ad-placement carbon-ads';
			bait.style.cssText = 'position:absolute;height:1px;width:1px;top:-1000px;left:-1000px;';
			document.body.appendChild(bait);

			const blocked = bait.offsetHeight === 0 && bait.offsetParent === null;
			bait.remove();

			setState({ isBlocked: blocked, checked: true });
		}, 1500);

		return () => clearTimeout(timer);
	}, []);

	return state;
}
