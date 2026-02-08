import { useEffect, useRef } from 'react';
import { useAdBlockDetector } from '@/hooks/useAdBlockDetector.ts';

interface AdContainerProps {
	slot: string;
	className?: string;
	format?: 'auto' | 'horizontal' | 'rectangle';
}

export function AdContainer({ slot, className = '', format = 'auto' }: AdContainerProps) {
	const { isBlocked, checked } = useAdBlockDetector();
	const adRef = useRef<HTMLModElement>(null);
	const pushed = useRef(false);

	useEffect(() => {
		if (!checked || isBlocked || pushed.current) return;
		try {
			((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
			pushed.current = true;
		} catch {
			// AdSense not available
		}
	}, [checked, isBlocked]);

	// Gracefully collapse when adblocker is active
	if (checked && isBlocked) return null;

	return (
		<div className={`overflow-hidden ${className}`}>
			<ins
				ref={adRef}
				className="adsbygoogle"
				style={{ display: 'block' }}
				data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
				data-ad-slot={slot}
				data-ad-format={format}
				data-full-width-responsive="true"
			/>
		</div>
	);
}
