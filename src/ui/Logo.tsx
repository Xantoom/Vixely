/** The Vixely mark: a V cut out of a rounded square. It inherits the text colour. */
export function LogoMark({ size = 24 }: { size?: number }) {
	return (
		<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
			<rect width="24" height="24" rx="6.5" fill="currentColor" />
			<path d="M5.8 7h3.1l3.1 8.2L15.1 7h3.1l-4.7 11h-3z" fill="var(--bg)" />
		</svg>
	);
}
