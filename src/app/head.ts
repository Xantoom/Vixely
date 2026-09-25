import { useEffect } from 'react';
import { m } from '@/paraglide/messages.js';

function setMeta(selector: string, attribute: 'name' | 'property', key: string, content: string) {
	let element = document.head.querySelector<HTMLMetaElement>(selector);
	if (!element) {
		element = document.createElement('meta');
		element.setAttribute(attribute, key);
		document.head.append(element);
	}
	element.content = content;
}

/**
 * The page's title and description, in the tab and for links shared from it. The build writes
 * the same into each page's HTML for search engines (scripts/prerender.ts).
 */
export function usePageHead(title: string | null, description?: string) {
	useEffect(() => {
		const full = title ? `${title} — Vixely` : `Vixely — ${m.home_title()}`;
		const text = description ?? m.site_description();
		document.title = full;
		setMeta('meta[name="description"]', 'name', 'description', text);
		setMeta('meta[property="og:title"]', 'property', 'og:title', full);
		setMeta('meta[property="og:description"]', 'property', 'og:description', text);
	}, [title, description]);
}
