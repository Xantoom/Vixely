import { Flag as DsFlag } from 'xantoom-design/react';

/** The flag of a language's country (the design system's, drawn: Windows has no flag emojis). */
export function Flag({ locale, className }: { locale: 'en' | 'fr'; className?: string }) {
	return <DsFlag code={locale === 'en' ? 'gb' : 'fr'} className={className} />;
}
