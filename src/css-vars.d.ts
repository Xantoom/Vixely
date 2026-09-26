import 'react';

/** CSS custom properties set inline, such as `style={{ '--sheet': '45%' }}`. */
declare module 'react' {
	interface CSSProperties {
		[property: `--${string}`]: string | number | undefined;
	}
}
