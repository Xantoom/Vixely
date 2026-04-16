const ADSENSE_SRC = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7841654233087376';

let injected = false;

export function loadAdsenseDeferred(): void {
	if (injected || typeof document === 'undefined') return;
	if (document.querySelector(`script[src="${ADSENSE_SRC}"]`)) {
		injected = true;
		return;
	}
	const schedule = (cb: () => void) => {
		const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
		if (typeof idle === 'function') idle(cb);
		else setTimeout(cb, 1500);
	};
	schedule(() => {
		if (injected) return;
		injected = true;
		const s = document.createElement('script');
		s.async = true;
		s.src = ADSENSE_SRC;
		s.crossOrigin = 'anonymous';
		document.head.appendChild(s);
	});
}
