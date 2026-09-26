import type { ReactNode } from 'react';
import { usePageHead } from '../head';
import { SiteFooter } from '../SiteFooter';
import { SiteHeader } from '../SiteHeader';

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
			<SiteHeader />
			<main className="mx-auto grid w-full max-w-[76rem] flex-1 content-start px-[clamp(1rem,4vw,2.5rem)] pt-[clamp(3rem,7vw,5rem)]">
				<article className="grid max-w-[68ch] gap-10">
					<header className="grid gap-3">
						<h1 className="text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.02] font-bold tracking-[-0.045em] text-balance">
							{content.title}
						</h1>
						{content.lede && <p className="text-lead text-muted">{content.lede}</p>}
					</header>
					{content.sections.map((section) => (
						<section key={section.title} className="text-body text-ink-2 grid gap-3 leading-relaxed">
							<h2 className="text-ink text-[1.5rem] font-bold tracking-[-0.025em]">{section.title}</h2>
							{section.body}
						</section>
					))}
				</article>
			</main>
			<SiteFooter />
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
