import { useId } from 'react';

type LogoProps = { className?: string };

export function Logo({ className }: LogoProps) {
	const uid = useId();
	const gradId = `vx-grad-${uid}`;
	const maskId = `vx-cut-${uid}`;
	return (
		<svg
			className={className}
			viewBox="0 0 64 64"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			role="img"
			aria-label="Vixely"
		>
			<defs>
				<linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
					<stop offset="0%" stopColor="#a78bfa" />
					<stop offset="100%" stopColor="#7c3aed" />
				</linearGradient>
				<mask id={maskId}>
					<rect width="64" height="64" fill="white" />
					<path d="M15 16 L32 50 L49 16 Z" fill="black" />
				</mask>
			</defs>
			<rect width="64" height="64" rx="14" fill={`url(#${gradId})`} mask={`url(#${maskId})`} />
		</svg>
	);
}
