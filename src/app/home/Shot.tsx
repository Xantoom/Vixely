import { getLocale } from '@/paraglide/runtime.js';
import { useTheme } from '../theme';

/**
 * A picture of the app (e2e/screenshots.ts), in the theme and language on screen. `sizes` says
 * how wide it is shown, so phones load the small one.
 */
export function Shot({
	name,
	alt,
	sizes,
	eager = false,
	className = '',
}: {
	name: string;
	alt: string;
	sizes: string;
	/** The first picture of the page: loaded at once, before the others. */
	eager?: boolean;
	className?: string;
}) {
	const { theme } = useTheme();
	const language = getLocale() === 'fr' ? '-fr' : '';
	const path = (width: number) => `/shots/${name}${language}-${theme}-${width}.webp`;
	return (
		<img
			src={path(960)}
			srcSet={`${path(960)} 960w, ${path(1920)} 1920w`}
			sizes={sizes}
			width={1920}
			height={1200}
			alt={alt}
			loading={eager ? 'eager' : 'lazy'}
			fetchPriority={eager ? 'high' : 'auto'}
			decoding="async"
			className={`block h-auto w-full ${className}`}
		/>
	);
}
