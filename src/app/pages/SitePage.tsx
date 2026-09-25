import type { ReactNode } from 'react';
import { AppBar } from '../AppBar';
import { usePageHead } from '../head';
import { SiteFooter } from '../SiteFooter';

export interface PageSection {
	title: string;
	body: ReactNode;
}

export interface PageContent {
	title: string;
	description: string;
	/** Shown under the title: the date of the text, or what it applies to. */
	lede?: string;
	sections: PageSection[];
}

/** A page of text about the site: about, privacy, terms, legal notice. */
export function SitePage({ content }: { content: PageContent }) {
	usePageHead(content.title, content.description);
	return (
		<div className="flex min-h-full flex-col">
			<AppBar />
			<main className="mx-auto grid w-full max-w-[1200px] flex-1 content-start gap-12 px-5 py-10 sm:px-10 sm:py-16 lg:px-16">
				<article className="grid max-w-[68ch] gap-8">
					<header className="grid gap-3">
						<h1 className="text-display font-bold tracking-[-0.045em] text-balance">{content.title}</h1>
						{content.lede && <p className="text-lead text-muted">{content.lede}</p>}
					</header>
					{content.sections.map((section) => (
						<section key={section.title} className="text-body grid gap-2.5 leading-relaxed">
							<h2 className="text-title font-bold tracking-[-0.02em]">{section.title}</h2>
							{section.body}
						</section>
					))}
				</article>
				<SiteFooter />
			</main>
		</div>
	);
}

/** A link in the text of a page. */
export function TextLink({ href, children }: { href: string; children: ReactNode }) {
	return (
		<a href={href} className="underline underline-offset-[3px] hover:no-underline">
			{children}
		</a>
	);
}
