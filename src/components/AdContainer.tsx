import { useEffect, useRef } from 'react';
import { useAdBlockDetector } from '@/hooks/useAdBlockDetector.ts';

interface MonetagAdProps {
	zoneId: string;
	className?: string;
}

/**
 * Renders a Monetag ad unit for the given zone ID.
 * Dynamically loads the zone script and creates a container.
 * Gracefully collapses when an adblocker is detected.
 */
export function MonetagAd({ zoneId, className = '' }: MonetagAdProps) {
	const { isBlocked, checked } = useAdBlockDetector();
	const containerRef = useRef<HTMLDivElement>(null);
	const loaded = useRef(false);

	useEffect(() => {
		if (!zoneId || !checked || isBlocked || loaded.current) return;

		const container = containerRef.current;
		if (!container) return;

		const script = document.createElement('script');
		script.async = true;
		script.setAttribute('data-cfasync', 'false');
		script.src = `//thubanoa.com/1/${zoneId}`;

		container.appendChild(script);
		loaded.current = true;

		return () => {
			script.remove();
		};
	}, [zoneId, checked, isBlocked]);

	if (!zoneId) return null;
	if (checked && isBlocked) return null;

	return (
		<div className={`overflow-hidden ${className}`}>
			<div ref={containerRef} id={`container-${zoneId}`} />
		</div>
	);
}
