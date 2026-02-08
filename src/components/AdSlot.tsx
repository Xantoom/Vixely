import { useState, useEffect, useRef } from "react";
import { useAdBlockDetector } from "@/hooks/useAdBlockDetector.ts";

type AdVariant = "footer" | "square";

interface AdSlotProps {
	variant: AdVariant;
	className?: string;
}

export function AdSlot({ variant, className = "" }: AdSlotProps) {
	const [dismissed, setDismissed] = useState(false);
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

	if (dismissed) return null;
	if (checked && isBlocked) return null;

	if (variant === "footer") {
		return (
			<div
				className={`fixed bottom-0 inset-x-0 z-40 border-t border-border bg-surface/80 backdrop-blur-xl hidden md:block ${className}`}
			>
				<div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
					<div className="flex items-center gap-3 flex-1">
						<ins
							ref={adRef}
							className="adsbygoogle"
							style={{ display: "inline-block", width: 728, height: 90 }}
							data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
							data-ad-slot="footer-leaderboard"
						/>
					</div>
					<button
						onClick={() => setDismissed(true)}
						className="ml-4 shrink-0 rounded-md p-1.5 text-text-tertiary hover:text-text hover:bg-border/50 transition-colors cursor-pointer"
						aria-label="Dismiss ad"
					>
						<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
							<path d="M1 1l12 12M13 1L1 13" />
						</svg>
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className={`rounded-xl border border-border bg-surface/60 backdrop-blur-sm ${className}`}>
			<ins
				ref={adRef}
				className="adsbygoogle"
				style={{ display: "inline-block", width: 300, height: 250 }}
				data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
				data-ad-slot="sidebar-rectangle"
			/>
		</div>
	);
}
