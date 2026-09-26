/**
 * The browser the scenarios drive: Chromium unless BROWSER names another (`firefox`, `webkit`).
 * Chromium's own switches are left out for the others; they get the same freedom to play sound.
 */
import { existsSync } from 'node:fs';
import { type Browser, type BrowserType, chromium, firefox, type LaunchOptions, webkit } from 'playwright-core';

export const browserName = process.env.BROWSER ?? 'chromium';

const types = { chromium, firefox, webkit };

/**
 * Firefox reports the modules still loading when a page is left as failed imports. Leaving is what
 * the scenarios do all the time: those are no errors of the app.
 */
function ignoreImportsCutByLeaving() {
	let leaving = false;
	addEventListener('beforeunload', () => {
		leaving = true;
	});
	addEventListener('unhandledrejection', (event) => {
		const message = event.reason instanceof Error ? event.reason.message : '';
		if (leaving && message.startsWith('error loading dynamically imported module')) event.preventDefault();
	});
}

async function launchOther(type: BrowserType, options: LaunchOptions): Promise<Browser> {
	const browser = await type.launch({
			...options,
			args: [],
			...(browserName === 'firefox'
				? { firefoxUserPrefs: { 'media.autoplay.default': 0, 'media.autoplay.blocking_policy': 0 } }
				: {}),
	});
	if (browserName !== 'firefox') return browser;
	const newContext = browser.newContext.bind(browser);
	browser.newContext = async (contextOptions) => {
		const context = await newContext(contextOptions);
		await context.addInitScript(ignoreImportsCutByLeaving);
		return context;
	};
	browser.newPage = async (pageOptions) => {
		const context = await browser.newContext(pageOptions);
		return context.newPage();
	};
	return browser;
}

export const engine = {
	async launch(options: LaunchOptions = {}): Promise<Browser> {
		if (browserName === 'chromium') return chromium.launch(options);
		const type = types[browserName as keyof typeof types];
		if (!type) throw new Error(`Unknown browser ${browserName}`);
		return launchOther(type, options);
	},
};

/**
 * A sample's path: browsers built without patented codecs (Playwright's Firefox) open its copy in
 * open codecs, VP9 and Opus, made by samples.ts.
 */
export function sample(name: string): string {
	return browserName === 'firefox' && existsSync(`samples/open/${name}`) ? `samples/open/${name}` : `samples/${name}`;
}
