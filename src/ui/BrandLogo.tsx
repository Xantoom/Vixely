import { Globe, Mail, Square } from 'lucide-react';
import { BRANDS, type BrandId } from './brands';

export type LogoId = BrandId | 'email' | 'linkedin' | 'slack' | 'square' | 'uhd' | 'web';

/** Whether white reads on a colour; dark glyphs go on light ones such as Snapchat's yellow. */
function takesWhite(hex: string): boolean {
	const value = Number.parseInt(hex.slice(1), 16);
	const r = (value >> 16) & 255;
	const g = (value >> 8) & 255;
	const b = value & 255;
	return 0.299 * r + 0.587 * g + 0.114 * b < 170;
}

/**
 * A place's logo on a rounded tile in its colour, like an app icon. Generic places (mail, a size,
 * the web) get an icon on a neutral tile.
 */
export function BrandLogo({ logo, size = 28 }: { logo: LogoId; size?: number }) {
	const glyph = Math.round(size * 0.58);
	const tile = 'grid flex-none place-items-center rounded-[28%]';
	if (logo === 'email' || logo === 'square' || logo === 'uhd' || logo === 'web') {
		return (
			<span
				className={`${tile} bg-surface-2 text-ink-2 shadow-[inset_0_0_0_1px_var(--line-2)]`}
				style={{ width: size, height: size }}
				aria-hidden="true"
			>
				{logo === 'email' && <Mail size={glyph} />}
				{logo === 'square' && <Square size={glyph} />}
				{logo === 'web' && <Globe size={glyph} />}
				{logo === 'uhd' && (
					<span className="font-bold tracking-[-0.04em]" style={{ fontSize: size * 0.4 }}>
						4K
					</span>
				)}
			</span>
		);
	}
	// Slack's logo is not free to use: its colour and a hash, as its channels are named.
	if (logo === 'slack') {
		return (
			<span
				className={`${tile} font-bold text-white`}
				style={{ width: size, height: size, background: '#4A154B', fontSize: size * 0.56 }}
				aria-hidden="true"
			>
				#
			</span>
		);
	}
	if (logo === 'linkedin') {
		return (
			<span
				className={`${tile} font-bold text-white`}
				style={{ width: size, height: size, background: '#0A66C2', fontSize: size * 0.5 }}
				aria-hidden="true"
			>
				in
			</span>
		);
	}
	const brand = BRANDS[logo];
	return (
		<span className={tile} style={{ width: size, height: size, background: brand.color }} aria-hidden="true">
			<svg viewBox="0 0 24 24" width={glyph} height={glyph} fill={takesWhite(brand.color) ? '#fff' : '#111'}>
				<path d={brand.path} />
			</svg>
		</span>
	);
}
