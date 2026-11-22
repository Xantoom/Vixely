/**
 * The face the app asks for first on Windows, Segoe UI, for pictures meant to be shown: Linux has
 * none of the app's system fonts and would draw the interface in DejaVu. Taken from Windows when
 * it is at hand (WSL); elsewhere the pictures keep whatever face the system has.
 */
import { existsSync } from 'node:fs';
import type { BrowserContext } from 'playwright-core';

const FONT = '/mnt/c/Windows/Fonts/SegUIVar.ttf';

export async function useSystemFont(context: BrowserContext) {
	if (!existsSync(FONT)) return;
	await context.route('**/__system-font.ttf', (route) => route.fulfill({ path: FONT, contentType: 'font/ttf' }));
	// The variable font, every weight the app uses (400 to 700) drawn as Windows draws them.
	const css = "@font-face { font-family: 'Segoe UI'; font-weight: 100 900; src: url('/__system-font.ttf'); }";
	await context.addInitScript((rule) => {
		const add = () => document.head.append(Object.assign(document.createElement('style'), { textContent: rule }));
		if (document.head) add();
		else document.addEventListener('DOMContentLoaded', add);
	}, css);
}
