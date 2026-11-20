import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { countPage } from './app/analytics';
import { ErrorScreen } from './app/ErrorScreen';
import { barePath, localePath, setAddressReplacer, startLocale } from './app/locale';
import { startPwa, warmApp } from './app/pwa';
import { isMediaKind } from './editors/registry';
import { clearLeftovers } from './media/save-target';
import { routeTree } from './routeTree.gen';
import './styles/app.css';

startLocale();

const router = createRouter({
	routeTree,
	// The router sees addresses without their language, which is added back on the way out.
	rewrite: {
		input: ({ url }) => {
			const bare = barePath(url.pathname);
			if (bare === url.pathname) return undefined;
			url.pathname = bare;
			return url;
		},
		output: ({ url }) => {
			const localized = localePath(url.pathname);
			if (localized === url.pathname) return undefined;
			url.pathname = localized;
			return url;
		},
	},
	defaultErrorComponent: ErrorScreen,
	defaultPreload: 'intent',
	scrollRestoration: true,
});

// A new language: the address changes in place, and a new rewrite has the router write its links
// again with the new prefix.
setAddressReplacer((href) => {
	router.history.replace(href, router.history.location.state);
	router.update({ ...router.options, rewrite: { ...router.options.rewrite } });
});

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router;
	}
}

startPwa();
void clearLeftovers();
// Work used to be kept across closed tabs, with copies of the files: what is left of it goes.
try {
	indexedDB.deleteDatabase('vixely-session');
} catch {
	// Storage refused (a private window): there is nothing kept either.
}

// Counted once the page has its title, which its own effects set.
router.subscribe('onResolved', ({ toLocation }) => {
	const section = barePath(toLocation.pathname).split('/')[1] ?? '';
	if (section === 'tools' || isMediaKind(section)) warmApp();
	setTimeout(() => {
		countPage(barePath(toLocation.pathname));
	}, 300);
});

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>,
);
