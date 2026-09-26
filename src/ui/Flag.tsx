import { useId } from 'react';

/**
 * The flag of a language's country, drawn here rather than as an emoji: Windows has no flag
 * emojis. Both flags fill the same small rounded box, cropped from their middle.
 */
export function Flag({ locale, className = '' }: { locale: 'en' | 'fr'; className?: string }) {
	const id = useId();
	const box = `block h-[0.95rem] w-[1.35rem] flex-none overflow-hidden rounded-[3px] shadow-[0_0_0_1px_rgb(0_0_0/0.12)] ${className}`;
	if (locale === 'fr') {
		return (
			<svg viewBox="0 0 3 2" preserveAspectRatio="xMidYMid slice" className={box} aria-hidden="true">
				<rect width="1" height="2" fill="#002654" />
				<rect x="1" width="1" height="2" fill="#fff" />
				<rect x="2" width="1" height="2" fill="#ce1126" />
			</svg>
		);
	}
	return (
		<svg viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice" className={box} aria-hidden="true">
			<clipPath id={`${id}t`}>
				<path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
			</clipPath>
			<rect width="60" height="30" fill="#012169" />
			<path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
			<path d="M0,0 L60,30 M60,0 L0,30" clipPath={`url(#${id}t)`} stroke="#c8102e" strokeWidth="4" />
			<path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
			<path d="M30,0 v30 M0,15 h60" stroke="#c8102e" strokeWidth="6" />
		</svg>
	);
}
