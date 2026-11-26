import { useId } from 'react';

/** The brand's own colours: the logo is the same drawing in every theme. */
const MARK = '#fff';
const GRADIENT = ['#2f6bff', '#5a4dff', '#9b4dff'] as const;

/**
 * The Vixely mark, of the Xantoom family: the V selected for editing, inside the box and the four
 * square handles an editor draws around what you transform. One drawing on every background.
 */
export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
	const gradient = useId();
	return (
		<svg width={size} height={size} className={className} viewBox="1 1 30 30" aria-hidden="true">
			<defs>
				<linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
					<stop offset="0" stopColor={GRADIENT[0]} />
					<stop offset=".55" stopColor={GRADIENT[1]} />
					<stop offset="1" stopColor={GRADIENT[2]} />
				</linearGradient>
			</defs>
			<rect x="1" y="1" width="30" height="30" rx="7.5" fill={`url(#${gradient})`} />
			<rect x="7.6" y="7.6" width="16.8" height="16.8" fill="none" stroke={MARK} />
			<g fill={MARK}>
				<rect x="5.9" y="5.9" width="3.4" height="3.4" rx=".6" />
				<rect x="22.7" y="5.9" width="3.4" height="3.4" rx=".6" />
				<rect x="5.9" y="22.7" width="3.4" height="3.4" rx=".6" />
				<rect x="22.7" y="22.7" width="3.4" height="3.4" rx=".6" />
				<polygon points="10.2,10.6 13.5,10.6 16,17.05 18.5,10.6 21.8,10.6 17.6,21.4 14.4,21.4" />
			</g>
		</svg>
	);
}
