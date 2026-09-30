import { Search, X } from 'lucide-react';
import { m } from '@/paraglide/messages.js';

/** A field that narrows a long list as one types, cleared with its cross or Escape. */
export function SearchField({
	value,
	onChange,
	label,
	className = '',
}: {
	value: string;
	onChange: (value: string) => void;
	/** Also the placeholder. */
	label: string;
	className?: string;
}) {
	return (
		<div className={`relative ${className}`}>
			<Search
				className="text-muted pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
				aria-hidden="true"
			/>
			<input
				type="search"
				value={value}
				aria-label={label}
				placeholder={label}
				onChange={(event) => {
					onChange(event.target.value);
				}}
				onKeyDown={(event) => {
					if (event.key === 'Escape' && value) {
						event.stopPropagation();
						onChange('');
					}
				}}
				className="bg-surface text-ui placeholder:text-muted focus-visible:outline-ed-text h-9 w-full rounded-sm pr-8 pl-8 [&::-webkit-search-cancel-button]:hidden"
			/>
			{value && (
				<button
					type="button"
					aria-label={m.search_clear()}
					onClick={() => {
						onChange('');
					}}
					className="text-muted hover:text-ink absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-full"
				>
					<X className="size-3.5" aria-hidden="true" />
				</button>
			)}
		</div>
	);
}

/** Lowercase, without accents: what matching ignores. */
export function searchable(text: string): string {
	return text
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase();
}
