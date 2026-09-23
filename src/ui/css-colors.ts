import { useMemo } from 'react';
import { useTheme } from '@/app/theme';

/**
 * Resolves CSS colour tokens (`--audio-1`) for drawing on a canvas, in the order given. Tokens use
 * light-dark(), which only a computed `color` resolves, so each one is applied to a probe element
 * and read back. Recomputed when the theme changes. Pass a constant array.
 */
export function useCssColors(tokens: readonly string[]): string[] {
	const [theme] = useTheme();
	return useMemo(() => {
		const probe = document.createElement('span');
		probe.style.display = 'none';
		document.body.append(probe);
		const colors = tokens.map((token) => {
			probe.style.color = `var(${token})`;
			return getComputedStyle(probe).color;
		});
		probe.remove();
		return colors;
	}, [tokens, theme]);
}
