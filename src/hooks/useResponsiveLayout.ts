import { useEffect, useState } from 'react';

export type LayoutTier = 'mobile' | 'tablet' | 'desktop' | 'ultrawide';

interface ResponsiveLayout {
	tier: LayoutTier;
	isMobile: boolean;
	isTablet: boolean;
	isDesktop: boolean;
	isUltrawide: boolean;
}

const BREAKPOINTS = { sm: 640, lg: 1024, uw: 1920 } as const;

function getTier(): LayoutTier {
	if (typeof window === 'undefined') return 'desktop';
	const w = window.innerWidth;
	if (w < BREAKPOINTS.sm) return 'mobile';
	if (w < BREAKPOINTS.lg) return 'tablet';
	if (w < BREAKPOINTS.uw) return 'desktop';
	return 'ultrawide';
}

export function useResponsiveLayout(): ResponsiveLayout {
	const [tier, setTier] = useState<LayoutTier>(getTier);

	useEffect(() => {
		const queries = [
			window.matchMedia(`(min-width: ${BREAKPOINTS.sm}px)`),
			window.matchMedia(`(min-width: ${BREAKPOINTS.lg}px)`),
			window.matchMedia(`(min-width: ${BREAKPOINTS.uw}px)`),
		];

		let rafId = 0;
		const update = () => {
			cancelAnimationFrame(rafId);
			rafId = requestAnimationFrame(() => {
				setTier(getTier());
			});
		};

		for (const mq of queries) mq.addEventListener('change', update);
		return () => {
			cancelAnimationFrame(rafId);
			for (const mq of queries) mq.removeEventListener('change', update);
		};
	}, []);

	return {
		tier,
		isMobile: tier === 'mobile',
		isTablet: tier === 'tablet',
		isDesktop: tier === 'desktop',
		isUltrawide: tier === 'ultrawide',
	};
}
